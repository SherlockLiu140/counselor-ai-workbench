export type FieldType =
  | "name"
  | "studentId"
  | "phone"
  | "identity"
  | "email"
  | "class"
  | "address"
  | "dorm"
  | "contact"
  | "date"
  | "birth"
  | "medical"
  | "family"
  | "custom";
export type Task = "talk" | "study" | "career" | "statistics" | "other";
export interface Student {
  id: string;
  name: string;
  studentId: string;
  className: string;
  phone?: string;
  identity?: string;
  email?: string;
  dorm?: string;
  address?: string;
  emergencyName?: string;
  emergencyPhone?: string;
  workStatus?: string;
  specialCare?: string;
  careTypes?: string;
  religion?: string;
  psychologicalNotes?: string;
  familySituation?: string;
  sexualOrientation?: string;
  currentRole?: string;
  formerRoles?: string;
  previousAverage?: string;
  latestAverage?: string;
  previousRank?: string;
  latestRank?: string;
  rankChange?: string;
  failedCount?: string;
  graduationDirection?: string;
  lastTalkDate?: string;
  importedTaskCount?: string;
}
export interface Options {
  task: Task;
  class: boolean;
  address: boolean;
  dates: boolean;
  medical: boolean;
  family: boolean;
}
export const defaultOptions: Options = {
  task: "talk",
  class: true,
  address: true,
  dates: true,
  medical: true,
  family: true,
};
export interface CustomRule {
  value: string;
  replacement: string;
}
export interface Detection {
  start: number;
  end: number;
  type: FieldType;
  replacement: string;
  reason: string;
  risk: "high" | "medium";
  priority: number;
  ambiguous?: boolean;
  studentIds?: string[];
}
export interface Finding extends Detection {
  id: string;
  original: string;
  action: "replace" | "restore" | "delete";
  reviewed: boolean;
}
export interface Context {
  text: string;
  students: Student[];
  codes: Record<string, string>;
  options: Options;
  customRules: CustomRule[];
}
export interface Detector {
  id: string;
  detect(context: Context): Detection[];
}
export const labels: Record<FieldType, string> = {
  name: "姓名",
  studentId: "学号 / 长数字",
  phone: "手机号",
  identity: "身份证号",
  email: "邮箱",
  class: "班级",
  address: "地址",
  dorm: "宿舍",
  contact: "联系人 / 社交账号",
  date: "精确时间",
  birth: "出生日期",
  medical: "医疗 / 心理",
  family: "家庭事件",
  custom: "手工标记",
};
