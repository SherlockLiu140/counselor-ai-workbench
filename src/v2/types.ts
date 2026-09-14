export type StudentWorkStatus =
  "正常" | "待关注" | "待谈话" | "跟进中" | "实习中" | "毕业去向待确认";

export interface ClassRecord {
  id: string;
  name: string;
  grade: string;
  major: string;
  cohort: string;
  createdAt: string;
  archived: boolean;
}

export interface StudentRecord {
  id: string;
  classId: string;
  studentNo: string;
  name: string;
  gender?: string;
  phone?: string;
  email?: string;
  dorm?: string;
  address?: string;
  status: StudentWorkStatus;
  tags: string[];
  specialCare?: boolean;
  careTypes?: string[];
  formerRoles?: string;
  importedLastTalkDate?: string;
  importedTaskCount?: number;
  importedRankChange?: string;
  currentRole?: string;
  graduationDirection?: GraduationDirection;
  createdAt: string;
  updatedAt: string;
}

export interface StudentSensitiveProfile {
  studentId: string;
  identity?: string;
  familySituation?: string;
  financialAidSituation?: string;
  religion?: string;
  sexualOrientation?: string;
  psychologicalNotes?: string;
  medicalNotes?: string;
  emergencyContact?: string;
  customFields: Array<{ label: string; value: string }>;
}

export interface StudentRoleHistory {
  id: string;
  studentId: string;
  roleName: string;
  startDate: string;
  endDate?: string;
  notes?: string;
}

export interface AcademicRecord {
  id: string;
  studentId: string;
  term: string;
  kind?: "average";
  rank?: number;
  failedCount?: number;
  course?: string;
  score?: number;
  failed?: boolean;
  source: string;
  importedAt: string;
}

export type AttendanceType = "present" | "late" | "absent" | "leave";
export interface AttendanceRecord {
  id: string;
  studentId: string;
  date: string;
  course?: string;
  type: AttendanceType;
  source: string;
  notes?: string;
}

export type EventStatus =
  | "新登记"
  | "待处理"
  | "已安排谈话"
  | "跟进中"
  | "等待反馈"
  | "已完成"
  | "已结案";
export interface EventRecord {
  id: string;
  studentId: string;
  type: string;
  occurredAt: string;
  sourceType: "class_committee" | "teacher" | "system" | "self" | "other";
  sourceText?: string;
  facts: string;
  priority: "low" | "medium" | "high";
  status: EventStatus;
  needsConversation: boolean;
  needsFollowUp: boolean;
  relatedConversationIds: string[];
  relatedTaskIds: string[];
  result?: string;
  closedAt?: string;
  createdAt: string;
}

export type TaskStatus = "待处理" | "已完成" | "已取消";
export interface TaskRecord {
  id: string;
  studentId?: string;
  eventId?: string;
  conversationId?: string;
  type: string;
  title: string;
  dueAt?: string;
  priority: "low" | "medium" | "high";
  status: TaskStatus;
  completionNote?: string;
  createdAt: string;
  completedAt?: string;
}

export interface ConversationRecord {
  id: string;
  studentId: string;
  eventId?: string;
  scenario: string;
  templateId?: string;
  happenedAt: string;
  location?: string;
  rawNotes: string;
  finalRecord?: string;
  studentExpression?: string;
  counselorGuidance?: string;
  agreements?: string;
  followUpPlan?: string;
  nextFollowUpAt?: string;
  aiUsed: boolean;
  createdAt: string;
}

export interface ConversationTemplate {
  id: string;
  name: string;
  scenario: string;
  preTalkChecklist: string[];
  talkDirections: string[];
  outputStructure: string[];
  writingStyle: string;
  customPromptRules?: string;
  defaultLength?: number;
  tone?: "正式" | "自然" | "简洁";
  person?: "第一人称" | "第三人称";
  commonOpening?: string;
  commonEnding?: string;
  highlightStudentExpression?: boolean;
  highlightCounselorGuidance?: boolean;
  highlightFollowUp?: boolean;
  dividedParagraphs?: boolean;
  favorite?: boolean;
  isDefault: boolean;
  createdByUser: boolean;
}

export type AwardStatus =
  | "待筛选"
  | "候选"
  | "待补材料"
  | "材料齐全"
  | "已提交"
  | "通过"
  | "未通过"
  | "已归档";

export interface AwardProject {
  id: string;
  name: string;
  type:
    | "奖学金"
    | "助学金"
    | "困难认定"
    | "优秀学生"
    | "优秀学生干部"
    | "自定义项目";
  year: string;
  term?: string;
  deadline?: string;
  requiredMaterials: string[];
  notes?: string;
  createdAt: string;
}

export interface AwardApplication {
  id: string;
  projectId?: string;
  studentId: string;
  type: string;
  year: string;
  eligible?: boolean;
  status: AwardStatus;
  requiredMaterials: string[];
  missingMaterials: string[];
  deadline?: string;
  result?: string;
  notes?: string;
}

export type GraduationDirection =
  "未明确" | "专升本" | "就业" | "考公 / 考编" | "考公考编" | "创业" | "其他";

export interface CareerPlan {
  studentId: string;
  direction: GraduationDirection;
  furtherStudy?: {
    targetSchool?: string;
    targetMajor?: string;
    stage?: string;
    planStatus?: string;
    recentStudy?: string;
    mockExamRecords?: Array<{ date: string; score?: number; notes?: string }>;
    difficulties?: string;
    lastConversationAt?: string;
    lastFollowUp?: string;
    nextFollowUp?: string;
    notes?: string;
  };
  employment?: {
    targetRole?: string;
    preferredRegion?: string;
    resumeStatus?: string;
    applications?: number;
    interviews?: number;
    offers?: number;
    signed?: boolean;
    internshipCompany?: string;
    currentStatus?: string;
    lastFollowUp?: string;
    nextStep?: string;
  };
  updatedAt?: string;
}

export interface MaterialArchive {
  id: string;
  type: string;
  title: string;
  studentId?: string;
  sourceEventIds: string[];
  sourceConversationIds: string[];
  content: string;
  aiUsed: boolean;
  createdAt: string;
}

export interface V2Space {
  schemaVersion: 2;
  classes: ClassRecord[];
  students: StudentRecord[];
  sensitiveProfiles: StudentSensitiveProfile[];
  roleHistory: StudentRoleHistory[];
  academicRecords: AcademicRecord[];
  attendanceRecords: AttendanceRecord[];
  events: EventRecord[];
  tasks: TaskRecord[];
  conversations: ConversationRecord[];
  conversationTemplates: ConversationTemplate[];
  awardProjects: AwardProject[];
  awardApplications: AwardApplication[];
  careerPlans: CareerPlan[];
  materialArchives: MaterialArchive[];
  privacyCodes: Record<string, string>;
  nextPrivacyCode: number;
  revision: number;
  migratedFromV1At?: string;
}
