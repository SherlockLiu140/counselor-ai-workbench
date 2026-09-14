import type { Context, Detection, Detector, FieldType } from "./types";

export function occurrences(text: string, value: string) {
  const spans: { start: number; end: number }[] = [];
  if (!value) return spans;
  for (
    let start = text.indexOf(value);
    start >= 0;
    start = text.indexOf(value, start + value.length)
  ) {
    const end = start + value.length;
    // Numeric / Latin identifiers require token boundaries; Chinese names use exact roster substrings.
    if (
      /^[\w@.+-]+$/.test(value) &&
      (/[\w]/.test(text[start - 1] ?? "") || /[\w]/.test(text[end] ?? ""))
    )
      continue;
    spans.push({ start, end });
  }
  return spans;
}
const fieldTypes: Record<string, FieldType> = {
  name: "name",
  studentId: "studentId",
  phone: "phone",
  identity: "identity",
  email: "email",
  className: "class",
  dorm: "dorm",
  address: "address",
  emergencyName: "contact",
  emergencyPhone: "phone",
};
export const rosterDetector: Detector = {
  id: "roster-exact",
  detect(ctx) {
    const values = new Map<string, { type: FieldType; ids: string[] }>();
    for (const student of ctx.students)
      for (const [key, type] of Object.entries(fieldTypes)) {
        if (
          (type === "class" && !ctx.options.class) ||
          ((type === "address" || type === "dorm") && !ctx.options.address)
        )
          continue;
        const value = student[key as keyof typeof student];
        if (!value) continue;
        const index = `${type}:${value}`;
        const entry = values.get(index) ?? { type, ids: [] };
        entry.ids.push(student.id);
        values.set(index, entry);
      }
    const results: Detection[] = [];
    for (const [key, { type, ids }] of values) {
      const value = key.slice(key.indexOf(":") + 1);
      for (const span of occurrences(ctx.text, value)) {
        let candidates = ids;
        if (type === "name" && ids.length > 1) {
          // Only evidence on the same line/sentence may resolve a duplicate name.
          const before = ctx.text.slice(0, span.start);
          const lastBoundary = Math.max(
            before.lastIndexOf("\n"),
            before.lastIndexOf("。"),
            before.lastIndexOf("；"),
          );
          const tail = ctx.text.slice(span.end).search(/[\n。；]/);
          const segment = ctx.text.slice(
            lastBoundary + 1,
            tail < 0 ? ctx.text.length : span.end + tail,
          );
          candidates = ids.filter((id) => {
            const s = ctx.students.find((x) => x.id === id)!;
            return [s.studentId, s.phone].some(
              (v) => v && occurrences(segment, v).length > 0,
            );
          });
          if (candidates.length !== 1) candidates = ids;
        }
        const ambiguous = type === "name" && candidates.length !== 1;
        const code = ctx.codes[candidates[0]];
        const replacement =
          type === "name" || type === "studentId"
            ? ambiguous
              ? "[同名学生·待确认]"
              : (code ?? "[学生·待确认]")
            : type === "class"
              ? "[班级已泛化]"
              : type === "address"
                ? "[详细地址已删除]"
                : type === "dorm"
                  ? "[宿舍已删除]"
                  : type === "contact"
                    ? "[联系人]"
                    : `[${type === "phone" ? "电话" : type === "identity" ? "身份证号" : "邮箱"}已删除]`;
        results.push({
          ...span,
          type,
          replacement,
          reason: ambiguous
            ? "花名册存在同名，当前语境无法唯一确定；请核对身份或使用不区分身份的标记。"
            : "本地花名册精确匹配；仅保留当前任务必要信息。",
          risk:
            ambiguous || ["phone", "identity", "email"].includes(type)
              ? "high"
              : "medium",
          priority: 100,
          ambiguous,
          studentIds: candidates,
        });
      }
    }
    return results;
  },
};

interface Rule {
  id: string;
  type: FieldType;
  pattern: RegExp;
  replacement: string | ((value: string, ctx: Context) => string);
  reason: string;
  priority: number;
  enabled?: (ctx: Context) => boolean;
  group?: number;
}
const rules: Rule[] = [
  {
    id: "identity",
    type: "identity",
    pattern: /(?<![\dA-Za-z])\d{17}[\dXx](?![\dA-Za-z])/g,
    replacement: "[身份证号已删除]",
    reason: "18 位身份证形态，即使校验码无效也按敏感信息处理。",
    priority: 90,
  },
  {
    id: "identity-legacy",
    type: "identity",
    pattern:
      /(?<!\d)\d{6}[5-9]\d(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}(?!\d)/g,
    replacement: "[身份证号已删除]",
    reason: "疑似 15 位历史身份证号。",
    priority: 85,
  },
  {
    id: "mobile",
    type: "phone",
    pattern:
      /(?<![\dA-Za-z])(?:\+?86[ -]?)?1[3-9]\d(?:[ -]?\d{4}){2}(?![\dA-Za-z])/g,
    replacement: "[手机号已删除]",
    reason: "中国大陆手机号格式；当前任务通常不需要联系方式。",
    priority: 80,
  },
  {
    id: "email",
    type: "email",
    pattern: /(?<![\w.+-])[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}(?![\w.-])/gi,
    replacement: "[邮箱已删除]",
    reason: "邮箱为直接联系标识，建议删除。",
    priority: 80,
  },
  {
    id: "student-label",
    type: "studentId",
    pattern: /(?:学号|学生编号)\s*[:：]?\s*([A-Za-z0-9_-]{4,40})/g,
    group: 1,
    replacement: "[学号已删除]",
    reason: "明确学号字段，未在花名册中建立身份。",
    priority: 75,
  },
  {
    id: "long-number",
    type: "studentId",
    pattern: /(?<![\dA-Za-z])\d{8,20}(?![\dA-Za-z])/g,
    replacement: "[长数字待核对]",
    reason: "可能是学号或其他编号；请核对，避免误删统计数字。",
    priority: 40,
  },
  {
    id: "social",
    type: "contact",
    pattern: /(?:微信(?:号)?|QQ(?:号)?)\s*[:：]\s*([A-Za-z0-9_-]{5,30})/g,
    group: 1,
    replacement: "[社交账号已删除]",
    reason: "带明确标签的高置信社交账号。",
    priority: 80,
  },
  {
    id: "class",
    type: "class",
    pattern: /(?:20\d{2}级)?[\u4e00-\u9fa5]{2,12}(?:专业)?\d{1,2}班/g,
    replacement: "[班级已泛化]",
    reason: "完整班级名称可能与其他字段组合识别。",
    priority: 30,
    enabled: (c) => c.options.class,
  },
  {
    id: "dorm",
    type: "dorm",
    pattern:
      /(?:宿舍\s*[:：]?\s*[A-Za-z0-9一二三四五六七八九十-]{1,12}(?:栋|幢|号楼)?[ -]?\d{2,4}(?:室)?|\d{1,2}(?:栋|幢|号楼)[ -]?\d{3,4}(?:室)?)/g,
    replacement: "[宿舍已删除]",
    reason: "具体住宿位置通常不属于任务最小必要信息。",
    priority: 60,
    enabled: (c) => c.options.address,
  },
  {
    id: "address",
    type: "address",
    pattern:
      /[\u4e00-\u9fa5]{2,8}省[\u4e00-\u9fa5]{2,8}市[^\s，。；、\n\t]{0,60}/g,
    replacement: (v) => `${v.slice(0, v.indexOf("省") + 1)}某市`,
    reason: "精确地址泛化到省级；请检查是否吞并了相邻文字。",
    priority: 60,
    enabled: (c) => c.options.address,
  },
  {
    id: "label-address",
    type: "address",
    pattern: /(?:住址|家庭地址|地址)\s*[:：]\s*([^\s，。；\n\t]{3,80})/g,
    group: 1,
    replacement: "[详细地址已删除]",
    reason: "带明确地址标签；建议删除详细位置。",
    priority: 55,
    enabled: (c) => c.options.address,
  },
  {
    id: "birth",
    type: "birth",
    pattern:
      /(?:出生日期|生日|出生于)\s*[:：]?\s*(\d{4}(?:年|[-/])\d{1,2}(?:月|[-/])\d{1,2}日?)/g,
    group: 1,
    replacement: "[出生日期已泛化，请按需补充年级]",
    reason: "出生日期通常不必要，可人工改为年级或年龄段。",
    priority: 75,
    enabled: (c) => c.options.dates,
  },
  {
    id: "date",
    type: "date",
    pattern:
      /(?<!\d)(?:19|20)\d{2}(?:年|[-/])\d{1,2}(?:月|[-/])\d{1,2}日?(?!\d)/g,
    replacement: (v) => {
      const n = v.match(/\d+/g)!;
      return `${n[0]}年${Number(n[1])}月`;
    },
    reason: "精确到日的时间泛化到月份。",
    priority: 50,
    enabled: (c) => c.options.dates,
  },
  {
    id: "medical",
    type: "medical",
    pattern:
      /(?:确诊(?:为)?|诊断为|患有)?(?:重度|中度|轻度)?(?:抑郁症|焦虑症|双相情感障碍|精神分裂症|强迫症|糖尿病|白血病)/g,
    replacement: "心理健康 / 医疗相关情况",
    reason: "当前任务不需要具体诊断细节时，建议泛化；规则词表不穷尽。",
    priority: 50,
    enabled: (c) => c.options.medical,
  },
  {
    id: "family",
    type: "family",
    pattern:
      /(?:父亲|母亲|父母|家长)(?:近期|最近)?(?:去世|离世|离异|离婚|失业|重病|入狱)/g,
    replacement: "家庭近期发生重大变故",
    reason: "具体家庭事件可能增加组合识别风险，建议泛化。",
    priority: 50,
    enabled: (c) => c.options.family,
  },
];
export const ruleDetectors: Detector[] = rules.map((rule) => ({
  id: rule.id,
  detect(ctx) {
    if (rule.enabled && !rule.enabled(ctx)) return [];
    return [
      ...ctx.text.matchAll(new RegExp(rule.pattern.source, rule.pattern.flags)),
    ].map((match) => {
      const value = match[rule.group ?? 0];
      const start =
        match.index! + (rule.group ? match[0].lastIndexOf(value) : 0);
      return {
        start,
        end: start + value.length,
        type: rule.type,
        replacement:
          typeof rule.replacement === "string"
            ? rule.replacement
            : rule.replacement(value, ctx),
        reason: rule.reason,
        risk: ["identity", "phone", "email", "contact"].includes(rule.type)
          ? ("high" as const)
          : ("medium" as const),
        priority: rule.priority,
      };
    });
  },
}));
export const customDetector: Detector = {
  id: "custom-literal",
  detect(ctx) {
    return ctx.customRules.flatMap((rule) =>
      occurrences(ctx.text, rule.value).map((span) => ({
        ...span,
        type: "custom" as const,
        replacement: rule.replacement,
        reason: "用户自定义字面匹配；请核对上下文。",
        risk: "medium" as const,
        priority: 200,
      })),
    );
  },
};
export const detectors: Detector[] = [
  rosterDetector,
  ...ruleDetectors,
  customDetector,
];
