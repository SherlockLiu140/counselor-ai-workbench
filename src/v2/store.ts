import type { Student as V1Student } from "../engine/types";
import type {
  ClassRecord,
  ConversationTemplate,
  EventRecord,
  GraduationDirection,
  StudentWorkStatus,
  StudentRecord,
  TaskRecord,
  V2Space,
} from "./types";

const DB_NAME = "counselor-workbench-v1";
const DB_VERSION = 2;

const now = () => new Date().toISOString();
const additionalTalkScenarios = [
  [
    "new-student",
    "新生首次谈话",
    ["了解专业与学校适应", "了解宿舍、学习习惯和大学目标"],
  ],
  [
    "daily-care",
    "日常关心",
    ["了解近期学习、作息和人际状态", "确认是否遇到实际困难"],
  ],
  [
    "academic",
    "挂科 / 成绩下降",
    ["核对具体课程和变化时间", "讨论补考、重修或学习支持计划"],
  ],
  [
    "relationship",
    "情感问题",
    ["听取学生描述的事实与感受", "了解对饮食、睡眠和学习的实际影响，不做诊断"],
  ],
  [
    "family",
    "家庭困难",
    ["确认当前实际困难与已有支持", "核实校内资助渠道和后续材料"],
  ],
  [
    "dorm",
    "宿舍 / 人际矛盾",
    ["分别核对事实与冲突起点", "讨论沟通边界和是否需要第三方协调"],
  ],
  [
    "wellbeing",
    "心理状态关注",
    [
      "了解睡眠、饮食、学习等事实变化",
      "只做支持性沟通，询问是否愿意获得校内专业支持",
    ],
  ],
  [
    "discipline",
    "违纪",
    ["核对事实与学生说明", "讨论规则、影响、改进措施和观察节点"],
  ],
  [
    "award",
    "奖助学金",
    ["确认申请意愿、条件和材料", "只记录资助审核所需的最小家庭信息"],
  ],
  [
    "internship",
    "实习异常",
    ["核对岗位、出勤、适应与安全事实", "确认需要学校支持的事项"],
  ],
  [
    "career",
    "就业迷茫",
    ["了解方向、能力、简历与投递现状", "确定下一步最小行动"],
  ],
  [
    "upgrade",
    "专升本",
    ["确认目标、基础、复习状态和弱项", "约定下一次复盘时间"],
  ],
  [
    "graduation",
    "毕业前谈话",
    ["核对毕业去向和未完成事项", "确认需要学校协助的内容"],
  ],
] as const;
const defaultTemplates: ConversationTemplate[] = [
  {
    id: "conversation-absence",
    name: "缺勤 / 迟到",
    scenario: "缺勤/迟到",
    preTalkChecklist: ["核对课程、日期与反馈来源", "只记录可确认的事实"],
    talkDirections: [
      "确认近期出勤事实",
      "了解作息、兼职、课程困难、身体或家庭因素",
      "共同确定改进计划与复查节点",
    ],
    outputStructure: [
      "基本情况",
      "学生主要表达",
      "班主任沟通与引导",
      "达成的共识/处理措施",
      "后续跟进事项",
    ],
    writingStyle: "客观、简洁，不添加未提供的事实。",
    isDefault: true,
    createdByUser: false,
  },
  ...additionalTalkScenarios.map(([id, name, directions]) => ({
    id: `conversation-${id}`,
    name,
    scenario: name,
    preTalkChecklist: [
      "查看最近事件、待办与历史谈话",
      "区分已知事实和待核实信息",
    ],
    talkDirections: [...directions],
    outputStructure: [
      "基本情况",
      "学生主要表达",
      "班主任沟通与引导",
      "达成的共识/处理措施",
      "后续跟进事项",
    ],
    writingStyle: "客观、自然、简洁，不添加未提供的事实，不给学生贴标签。",
    isDefault: false,
    createdByUser: false,
  })),
];

export function emptyV2Space(): V2Space {
  return {
    schemaVersion: 2,
    classes: [],
    students: [],
    sensitiveProfiles: [],
    roleHistory: [],
    academicRecords: [],
    attendanceRecords: [],
    events: [],
    tasks: [],
    conversations: [],
    conversationTemplates: structuredClone(defaultTemplates),
    awardProjects: [],
    awardApplications: [],
    careerPlans: [],
    materialArchives: [],
    privacyCodes: {},
    nextPrivacyCode: 1,
    revision: 0,
  };
}

function normalizeV2Space(value?: Partial<V2Space>): V2Space {
  const base = emptyV2Space();
  const state = { ...base, ...value } as V2Space;
  const existingTemplates = value?.conversationTemplates ?? [];
  state.conversationTemplates = [
    ...defaultTemplates.filter(
      (template) => !existingTemplates.some((item) => item.id === template.id),
    ),
    ...existingTemplates,
  ].map((template) => ({
    defaultLength: 300,
    tone: "自然",
    person: "第三人称",
    highlightStudentExpression: true,
    highlightCounselorGuidance: true,
    highlightFollowUp: true,
    dividedParagraphs: true,
    favorite: false,
    ...template,
  }));
  state.privacyCodes = { ...(value?.privacyCodes ?? {}) };
  state.nextPrivacyCode = value?.nextPrivacyCode ?? 1;
  for (const student of state.students)
    if (!state.privacyCodes[student.id])
      state.privacyCodes[student.id] =
        `S${String(state.nextPrivacyCode++).padStart(3, "0")}`;
  return state;
}

interface V1SpaceLike {
  students?: V1Student[];
  codes?: Record<string, string>;
  nextCode?: number;
  revision?: number;
}

function classMeta(
  name: string,
): Pick<ClassRecord, "grade" | "major" | "cohort"> {
  const grade = name.match(/(20\d{2})级/)?.[1] ?? "未设置";
  const major = name.replace(/20\d{2}级/, "").replace(/\d+班$/, "") || "未设置";
  return { grade, major, cohort: grade };
}

const workStatuses: StudentWorkStatus[] = [
  "正常", "待关注", "待谈话", "跟进中", "实习中", "毕业去向待确认",
];
const directions: GraduationDirection[] = [
  "未明确", "专升本", "就业", "考公 / 考编", "考公考编", "创业", "其他",
];
const clean = (value?: string) => value?.trim() || undefined;
const numberValue = (value?: string) => {
  if (!value?.trim()) return undefined;
  const parsed = Number(value.replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
};
export function parseSpecialCare(value?: string) {
  return /^(是|yes|y|true|1|特殊关爱)$/i.test(value?.trim() ?? "");
}
export function parseCareTypes(value?: string) {
  return [...new Set((value ?? "").split(/[、,，;；/+|\n]+/).map((item) => item.trim()).filter(Boolean))];
}

export function migrateV1Space(v1: V1SpaceLike, migratedAt = now()): V2Space {
  const source = v1.students ?? [];
  const classNames = [
    ...new Set(source.map((student) => student.className || "未分班")),
  ];
  const classes = classNames.map((name, index) => ({
    id: `class:${encodeURIComponent(name)}`,
    name,
    ...classMeta(name),
    createdAt: migratedAt,
    archived: false,
  }));
  const students: StudentRecord[] = source.map((student) => ({
    id: student.id,
    classId: `class:${encodeURIComponent(student.className || "未分班")}`,
    studentNo: student.studentId,
    name: student.name,
    phone: student.phone,
    email: student.email,
    dorm: student.dorm,
    address: student.address,
    status: workStatuses.includes(student.workStatus as StudentWorkStatus)
      ? (student.workStatus as StudentWorkStatus)
      : "正常",
    tags: [],
    specialCare: parseSpecialCare(student.specialCare),
    careTypes: parseSpecialCare(student.specialCare) ? parseCareTypes(student.careTypes) : [],
    currentRole: clean(student.currentRole),
    formerRoles: clean(student.formerRoles),
    importedLastTalkDate: clean(student.lastTalkDate),
    importedTaskCount: numberValue(student.importedTaskCount),
    importedRankChange: clean(student.rankChange),
    graduationDirection: directions.includes(student.graduationDirection as GraduationDirection)
      ? (student.graduationDirection as GraduationDirection)
      : "未明确",
    createdAt: migratedAt,
    updatedAt: migratedAt,
  }));
  const sensitiveProfiles = source
    .filter(
      (student) =>
        student.identity || student.emergencyName || student.emergencyPhone ||
        student.familySituation || student.psychologicalNotes || student.religion ||
        student.sexualOrientation,
    )
    .map((student) => ({
      studentId: student.id,
      identity: student.identity,
      familySituation: clean(student.familySituation),
      financialAidSituation: clean(student.familySituation),
      religion: clean(student.religion),
      sexualOrientation: clean(student.sexualOrientation),
      psychologicalNotes: clean(student.psychologicalNotes),
      emergencyContact: [student.emergencyName, student.emergencyPhone]
        .filter(Boolean)
        .join(" "),
      customFields: [],
    }));
  const privacyCodes = { ...(v1.codes ?? {}) };
  let nextPrivacyCode = Math.max(
    v1.nextCode ?? 1,
    ...Object.values(privacyCodes).map(
      (code) => Number(code.replace(/^S/, "")) + 1 || 1,
    ),
  );
  for (const student of students)
    if (!privacyCodes[student.id])
      privacyCodes[student.id] =
        `S${String(nextPrivacyCode++).padStart(3, "0")}`;
  return {
    ...emptyV2Space(),
    classes,
    students,
    sensitiveProfiles,
    privacyCodes,
    nextPrivacyCode,
    academicRecords: source.flatMap((student) => {
      const previousScore = numberValue(student.previousAverage);
      const latestScore = numberValue(student.latestAverage);
      const previousRank = numberValue(student.previousRank);
      const latestRank = numberValue(student.latestRank);
      const failedCount = numberValue(student.failedCount);
      return [
        previousScore !== undefined || previousRank !== undefined
          ? { id: `academic:${student.id}:previous`, studentId: student.id, term: "上次", kind: "average" as const, score: previousScore, rank: previousRank, source: "花名册导入", importedAt: migratedAt }
          : undefined,
        latestScore !== undefined || latestRank !== undefined || failedCount !== undefined
          ? { id: `academic:${student.id}:latest`, studentId: student.id, term: "最近", kind: "average" as const, score: latestScore, rank: latestRank, failedCount, failed: (failedCount ?? 0) > 0, source: "花名册导入", importedAt: migratedAt }
          : undefined,
      ].filter((item): item is NonNullable<typeof item> => !!item);
    }),
    migratedFromV1At: migratedAt,
  };
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of ["space", "v2-space", "backups"])
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
    };
    request.onerror = () => reject(new Error("无法打开本地数据空间。"));
    request.onblocked = () =>
      reject(new Error("本地数据正在被旧窗口使用，请关闭旧窗口后重试。"));
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}

export interface V2LocalStore {
  read(): Promise<V2Space>;
  update(fn: (state: V2Space) => void): Promise<V2Space>;
  close(): void;
}

export class V2MemoryStore implements V2LocalStore {
  private state = emptyV2Space();
  constructor(initial?: V2Space) {
    if (initial) this.state = structuredClone(initial);
  }
  async read() {
    return structuredClone(this.state);
  }
  async update(fn: (state: V2Space) => void) {
    const next = structuredClone(this.state);
    fn(next);
    next.revision++;
    this.state = next;
    return this.read();
  }
  close() {}
}

export class V2IndexedStore implements V2LocalStore {
  private constructor(private db: IDBDatabase) {}
  static async open() {
    const db = await openDatabase();
    const store = new V2IndexedStore(db);
    try {
      await store.initialize();
      return store;
    } catch (error) {
      db.close();
      throw error;
    }
  }
  private initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(
        ["space", "v2-space", "backups"],
        "readwrite",
      );
      const v2Table = tx.objectStore("v2-space");
      const existing = v2Table.get("active");
      existing.onsuccess = () => {
        if (existing.result) return;
        const v1Request = tx.objectStore("space").get("active");
        v1Request.onsuccess = () => {
          try {
            const v1 = v1Request.result as V1SpaceLike | undefined;
            if (v1) {
              tx.objectStore("backups").put(
                {
                  createdAt: now(),
                  sourceVersion: 1,
                  data: structuredClone(v1),
                },
                "v1-before-v2",
              );
            }
            v2Table.put(v1 ? migrateV1Space(v1) : emptyV2Space(), "active");
          } catch (error) {
            tx.abort();
            reject(error);
          }
        };
      };
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () =>
        reject(new Error("旧数据迁移失败，未写入当前数据空间。"));
    });
  }
  read(): Promise<V2Space> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction("v2-space", "readonly");
      const request = tx.objectStore("v2-space").get("active");
      tx.oncomplete = () => resolve(normalizeV2Space(request.result));
      tx.onerror = () => reject(new Error("读取本地数据失败。"));
    });
  }
  update(fn: (state: V2Space) => void): Promise<V2Space> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction("v2-space", "readwrite");
      const table = tx.objectStore("v2-space");
      const request = table.get("active");
      let next: V2Space;
      request.onsuccess = () => {
        try {
          next = normalizeV2Space(structuredClone(request.result));
          fn(next);
          next.revision++;
          table.put(next, "active");
        } catch (error) {
          tx.abort();
          reject(error);
        }
      };
      tx.oncomplete = () => resolve(structuredClone(next));
      tx.onabort = tx.onerror = () =>
        reject(new Error("本地保存失败，操作已回滚。"));
    });
  }
  close() {
    this.db.close();
  }
}

export async function importV1Students(
  store: V2LocalStore,
  students: V1Student[],
) {
  return store.update((state) => {
    const stamp = now();
    const incoming = migrateV1Space({ students }, stamp);
    for (const klass of incoming.classes)
      if (!state.classes.some((item) => item.id === klass.id))
        state.classes.push(klass);
    for (const student of incoming.students) {
      const raw = students.find((item) => item.id === student.id)!;
      const duplicate = state.students.find(
        (item) => item.studentNo === student.studentNo,
      );
      if (duplicate && duplicate.id !== student.id)
        throw new Error(`学号 ${student.studentNo} 已对应其他学生。`);
      const index = state.students.findIndex((item) => item.id === student.id);
      if (index >= 0) {
        state.students[index] = {
          ...state.students[index],
          ...student,
          status: clean(raw.workStatus) ? student.status : state.students[index].status,
          specialCare: clean(raw.specialCare) ? student.specialCare : state.students[index].specialCare,
          careTypes: clean(raw.careTypes) ? student.careTypes : state.students[index].careTypes,
          tags: state.students[index].tags,
          createdAt: state.students[index].createdAt,
          updatedAt: stamp,
        };
      } else state.students.push(student);
      if (!state.privacyCodes[student.id])
        state.privacyCodes[student.id] =
          `S${String(state.nextPrivacyCode++).padStart(3, "0")}`;
    }
    for (const profile of incoming.sensitiveProfiles) {
      const index = state.sensitiveProfiles.findIndex((item) => item.studentId === profile.studentId);
      if (index >= 0) state.sensitiveProfiles[index] = { ...state.sensitiveProfiles[index], ...profile };
      else state.sensitiveProfiles.push(profile);
    }
    const incomingIds = new Set(incoming.academicRecords.map((item) => item.studentId));
    state.academicRecords = state.academicRecords.filter(
      (item) => !(incomingIds.has(item.studentId) && item.source === "花名册导入"),
    );
    state.academicRecords.push(...incoming.academicRecords);
  });
}

export function createId(prefix: string) {
  return `${prefix}:${crypto.randomUUID()}`;
}

export async function addConversationTemplate(
  store: V2LocalStore,
  template: Omit<ConversationTemplate, "id" | "createdByUser" | "isDefault">,
) {
  return store.update((state) => {
    if (!template.name.trim() || !template.scenario.trim())
      throw new Error("请填写模板名称和适用场景。 ");
    state.conversationTemplates.push({
      ...template,
      id: createId("conversation-template"),
      name: template.name.trim(),
      scenario: template.scenario.trim(),
      isDefault: false,
      createdByUser: true,
    });
  });
}

export async function registerEvent(
  store: V2LocalStore,
  input: Omit<
    EventRecord,
    "id" | "createdAt" | "status" | "relatedConversationIds" | "relatedTaskIds"
  >,
) {
  return store.update((state) => {
    const stamp = now();
    const event: EventRecord = {
      ...input,
      id: createId("event"),
      createdAt: stamp,
      status:
        input.needsConversation || input.needsFollowUp ? "待处理" : "新登记",
      relatedConversationIds: [],
      relatedTaskIds: [],
    };
    state.events.unshift(event);
    const student = state.students.find((item) => item.id === event.studentId);
    if (student && event.needsConversation) student.status = "待谈话";
    const addTask = (type: string, title: string, days: number) => {
      const due = new Date();
      due.setDate(due.getDate() + days);
      const task = {
        id: createId("task"),
        studentId: event.studentId,
        eventId: event.id,
        type,
        title,
        dueAt: due.toISOString().slice(0, 10),
        priority: event.priority,
        status: "待处理" as const,
        createdAt: stamp,
      };
      state.tasks.unshift(task);
      event.relatedTaskIds.push(task.id);
    };
    if (event.needsConversation)
      addTask("待谈话", `就“${event.type}”与学生谈话`, 1);
    else if (event.needsFollowUp)
      addTask("待复查", `复查“${event.type}”处理情况`, 7);
  });
}

export async function addTaskRecord(
  store: V2LocalStore,
  input: Pick<
    TaskRecord,
    "studentId" | "eventId" | "type" | "title" | "dueAt" | "priority"
  >,
) {
  return store.update((state) => {
    const task: TaskRecord = {
      ...input,
      id: createId("task"),
      status: "待处理",
      createdAt: now(),
    };
    state.tasks.unshift(task);
    if (task.eventId) {
      const event = state.events.find((item) => item.id === task.eventId);
      if (event && !event.relatedTaskIds.includes(task.id))
        event.relatedTaskIds.push(task.id);
    }
  });
}

export async function updateStudentCare(
  store: V2LocalStore,
  studentId: string,
  specialCare: boolean,
  careTypes: string[],
) {
  return store.update((state) => {
    const student = state.students.find((item) => item.id === studentId);
    if (!student) throw new Error("未找到学生档案。");
    student.specialCare = specialCare;
    student.careTypes = specialCare ? [...new Set(careTypes.map((item) => item.trim()).filter(Boolean))] : [];
    student.updatedAt = now();
  });
}
