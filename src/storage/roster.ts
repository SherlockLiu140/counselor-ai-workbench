import type { Student } from "../engine/types";
export const rosterFields = {
  name: "姓名",
  studentId: "学号",
  className: "班级",
  phone: "手机号",
  identity: "身份证号",
  email: "邮箱",
  dorm: "宿舍",
  address: "家庭住址",
  emergencyName: "紧急联系人姓名",
  emergencyPhone: "紧急联系人电话",
  workStatus: "当前状态",
  specialCare: "是否特殊关爱",
  careTypes: "特殊关爱类型",
  religion: "信教情况",
  psychologicalNotes: "心理健康情况",
  familySituation: "家庭困难情况",
  sexualOrientation: "性取向",
  currentRole: "当前班委",
  formerRoles: "曾任班委",
  previousAverage: "上次平均成绩",
  latestAverage: "最近平均成绩",
  previousRank: "上次班级排名",
  latestRank: "最近班级排名",
  rankChange: "排名变化",
  failedCount: "挂科门数",
  graduationDirection: "毕业方向",
  lastTalkDate: "最近谈话日期",
  importedTaskCount: "待办数量",
};
export type FieldMap = Record<keyof typeof rosterFields, number>;
const aliases: Record<string, string[]> = {
  address: ["地址", "家庭地址"], phone: ["电话", "手机号码"],
  religion: ["宗教信仰"], psychologicalNotes: ["心理健康相关记录"],
  workStatus: ["工作状态"], lastTalkDate: ["最近谈话时间"],
};
/** 表头与字段名（含别名）逐字匹配；BOM 与首尾空格先去掉。 */
export function matchesRosterHeader(key: keyof typeof rosterFields, header: string) {
  const value = header.replace(/^\uFEFF/, "").trim();
  return [rosterFields[key], ...(aliases[key] ?? [])].includes(value);
}
export function guessFields(headers: string[]): FieldMap {
  return Object.fromEntries(
    Object.entries(rosterFields).map(([key, label]) => [
      key,
      headers.findIndex((x) =>
        [label, ...(aliases[key] ?? [])].includes(x.replace(/^\uFEFF/, "").trim()),
      ),
    ]),
  ) as FieldMap;
}
/** 该列能否落到某个字段上；不能的话导入时会被整列忽略，统计就会缺数。 */
export function isRosterHeader(header: string): boolean {
  return (Object.keys(rosterFields) as Array<keyof typeof rosterFields>).some((key) =>
    matchesRosterHeader(key, header),
  );
}
// Stable roster key uses student number. Names alone never establish identity.
export function parseRoster(rows: string[][], fields: FieldMap): Student[] {
  if (fields.name < 0 || fields.studentId < 0)
    throw new Error("请选择姓名与学号列；缺少学号的记录无法可靠建立稳定映射。");
  const selected = Object.values(fields).filter((x) => x >= 0);
  if (new Set(selected).size !== selected.length)
    throw new Error("同一列不能映射到多个字段。");
  const seen = new Set<string>();
  const students = rows
    .slice(1)
    .filter((row) => row.some((cell) => cell.trim()))
    .map((row, index) => {
      const values = Object.fromEntries(
        Object.keys(rosterFields).filter((key) => fields[key as keyof FieldMap] >= 0).map((key) => [
          key,
          (row[fields[key as keyof FieldMap]] ?? "").trim(),
        ]),
      );
      if (!values.name || !values.studentId)
        throw new Error(`第 ${index + 2} 行缺少姓名或学号，未导入任何记录。`);
      if (seen.has(values.studentId))
        throw new Error(`第 ${index + 2} 行学号重复，请先核对花名册。`);
      if (!/^[\w-]{2,40}$/.test(values.studentId))
        throw new Error(
          `第 ${index + 2} 行学号格式不支持，请使用文本形式的学号。`,
        );
      seen.add(values.studentId);
      return { ...values, id: `student:${values.studentId}` } as Student;
    });
  if (!students.length) throw new Error("花名册没有有效学生记录。");
  return students;
}
