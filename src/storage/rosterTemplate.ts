import { isRosterHeader, rosterFields } from "./roster";

/**
 * 花名册导入模板。
 *
 * 导入是按「表头字面匹配字段名」识别的（见 guessFields），
 * 表头少一个字、多一个空格，这一列就会被整列丢掉，特殊关爱人数、
 * 挂科人数这类统计随之出错。所以模板必须直接由 rosterFields 生成，
 * 而不是手写一份可能过期的表头。
 */

/** 与 rosterFields 完全同源的表头，顺序也一致。 */
export function rosterTemplateHeaders(): string[] {
  return Object.values(rosterFields);
}

/** 花名册工作表：只有表头，示例值统一放在「字段说明」表，避免被当成真人导入。 */
export function rosterTemplateRows(): string[][] {
  return [rosterTemplateHeaders()];
}

/**
 * 学校系统导出的花名册几乎都会带一列「序号」，它本来就不该被导入。
 * 这类纯辅助列不算「认不出的列」，否则每条导入都会弹一堆无意义提示。
 */
const ignoredHeaders = new Set(["序号", "编号", "行号", "序", "no", "no.", "#", "-"]);

/** 表头里系统认不出来、导入时会被整列忽略的列。 */
export function unknownRosterHeaders(headers: string[]): string[] {
  return headers
    .map((header) => header.replace(/^\uFEFF/, "").trim())
    .filter(
      (header) =>
        header && !isRosterHeader(header) && !ignoredHeaders.has(header.toLowerCase()),
    );
}

/** 同名列：字段映射只认第一列，后面那列的数据会被丢掉。 */
export function duplicatedRosterHeaders(headers: string[]): string[] {
  const seen = new Set<string>();
  const duplicated = new Set<string>();
  for (const header of headers) {
    const value = header.replace(/^\uFEFF/, "").trim();
    if (!value || !isRosterHeader(value)) continue;
    if (seen.has(value)) duplicated.add(value);
    seen.add(value);
  }
  return [...duplicated];
}

export interface RosterHeaderIssues {
  /** 系统认不出的列名，导入时整列忽略。 */
  unknown: string[];
  /** 重复的列名，只有第一列生效。 */
  duplicated: string[];
}

export function rosterHeaderIssues(headers: string[]): RosterHeaderIssues {
  return {
    unknown: unknownRosterHeaders(headers),
    duplicated: duplicatedRosterHeaders(headers),
  };
}

interface GuideEntry {
  /** 字段名，必须与 rosterFields 的标签逐字相同。 */
  field: string;
  required: boolean;
  note: string;
  example: string;
}

const guide: GuideEntry[] = [
  {
    field: "姓名",
    required: true,
    note: "必填。与学号一起决定学生身份，不能留空。",
    example: "林知禾",
  },
  {
    field: "学号",
    required: true,
    note: "必填。用文本格式填写，不要让它变成 1.2345678E+10 这样的科学计数法。",
    example: "20250101001",
  },
  {
    field: "班级",
    required: false,
    note: "同一个人只写一个班级；留空进入「未分班」，可稍后再改。",
    example: "25 中药 2 班",
  },
  {
    field: "手机号",
    required: false,
    note: "文本格式。11 位号码首位的 1 不要丢，也不要带空格与连字符。",
    example: "13800000000",
  },
  {
    field: "身份证号",
    required: false,
    note: "文本格式。默认不进入任何 AI 材料，仅本地可见。",
    example: "330100200501010011",
  },
  { field: "邮箱", required: false, note: "选填。", example: "linzh@example.com" },
  { field: "宿舍", required: false, note: "选填，按学校习惯写完整楼栋房号。", example: "3 号楼 412" },
  {
    field: "家庭住址",
    required: false,
    note: "选填。这是敏感信息，AI 材料里默认只保留到区／县一级。",
    example: "浙江省杭州市西湖区",
  },
  { field: "紧急联系人姓名", required: false, note: "选填，建议填写与学生的关系。", example: "林父" },
  { field: "紧急联系人电话", required: false, note: "文本格式，同手机号。", example: "13900000000" },
  {
    field: "当前状态",
    required: false,
    note: "只能填这几个：正常 / 待关注 / 待谈话 / 跟进中 / 实习中 / 毕业去向待确认。写错或留空按「正常」。",
    example: "待关注",
  },
  {
    field: "是否特殊关爱",
    required: false,
    note: "填「是」才算特殊关爱，认 是 / 1 / true；其余一律按「否」，留空即否。",
    example: "是",
  },
  {
    field: "特殊关爱类型",
    required: false,
    note: "仅在「是否特殊关爱」为「是」时生效。多个类型用「、」隔开。",
    example: "家庭经济困难、心理关注",
  },
  {
    field: "信教情况",
    required: false,
    note: "敏感字段。确有必要才填，默认不会进入 AI 材料。",
    example: "无",
  },
  {
    field: "心理健康情况",
    required: false,
    note: "只记录已有的事实与结论，不在这里做判断或贴标签。",
    example: "已由学校心理中心评估",
  },
  { field: "家庭困难情况", required: false, note: "用于助学金等材料的背景说明。", example: "低保家庭" },
  {
    field: "性取向",
    required: false,
    note: "敏感字段。默认不进入 AI 材料，非必要不建议在花名册里填。",
    example: "（建议留空）",
  },
  { field: "当前班委", required: false, note: "当前在任职务。", example: "生活委员" },
  { field: "曾任班委", required: false, note: "多个职务用「、」隔开。", example: "学习委员、组长" },
  { field: "上次平均成绩", required: false, note: "数字。可写「82」，也可写「82.5 分」，系统只取数字。", example: "82.5" },
  { field: "最近平均成绩", required: false, note: "数字，写最新一次。", example: "78" },
  { field: "上次班级排名", required: false, note: "数字，写名次本身，不要写「第 3 名」。", example: "3" },
  { field: "最近班级排名", required: false, note: "数字，写最新一次名次。", example: "9" },
  {
    field: "排名变化",
    required: false,
    note: "自由文本，用于记录变化原因，不参与计算。",
    example: "较上次下降 6 名",
  },
  {
    field: "挂科门数",
    required: false,
    note: "数字。填 0 表示无挂科；填了大于 0 的数，学生才会进入挂科名单。",
    example: "2",
  },
  {
    field: "毕业方向",
    required: false,
    note: "只能填：专升本 / 就业 / 考公 / 考编 / 考公考编 / 创业 / 其他 / 未明确。写错或留空按「未明确」。",
    example: "专升本",
  },
  {
    field: "最近谈话日期",
    required: false,
    note: "日期文本，格式 2026-03-05。留空表示本机还没有谈话记录。",
    example: "2026-03-05",
  },
  {
    field: "待办数量",
    required: false,
    note: "数字。用于把学校系统里的存量待办带进来做参考。",
    example: "3",
  },
];

/** 「字段说明」工作表：一行一个字段，解释必填与写法。 */
export function rosterGuideRows(): string[][] {
  return [
    ["字段（表头请勿改名）", "是否必填", "填写说明", "示例值"],
    ...guide.map((item) => [item.field, item.required ? "必填" : "选填", item.note, item.example]),
  ];
}

/** 模板自查：rosterFields 新增字段时，说明表也要跟着补上。 */
export function missingGuideFields(): string[] {
  const documented = new Set(guide.map((item) => item.field));
  return rosterTemplateHeaders().filter((header) => !documented.has(header));
}

const csvCell = (value: string) =>
  /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

/** CSV 版本：带 BOM，Excel / WPS 直接双击打开不乱码。 */
export function rosterTemplateCsv(): string {
  return `\uFEFF${rosterTemplateRows().map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
