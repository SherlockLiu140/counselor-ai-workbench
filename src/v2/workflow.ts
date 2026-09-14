import type { V2LocalStore } from "./store";
import type {
  ConversationRecord,
  ConversationTemplate,
  EventRecord,
  TaskRecord,
} from "./types";

const id = (prefix: string) => `${prefix}:${crypto.randomUUID()}`;
const now = () => new Date().toISOString();

/** 谈话记录里与「成文」有关的字段：事件谈话与直接发起谈话共用同一套。 */
export interface ConversationDraft {
  templateId?: string;
  happenedAt: string;
  location?: string;
  rawNotes: string;
  studentExpression: string;
  counselorGuidance: string;
  agreements: string;
  followUpPlan: string;
  nextFollowUpAt?: string;
}

export interface ConversationInput extends ConversationDraft {
  eventId: string;
}

/**
 * 成文需要的「主题 + 已知事实」。事件谈话直接传 EventRecord（结构兼容，
 * 无需改调用方）；直接发起的谈话没有前置事件，用一个由谈话主题生成的最小对象即可。
 */
export interface ConversationSubject {
  type: string;
  facts: string;
}

export function formatConversationRecord(
  studentName: string,
  subject: ConversationSubject,
  input: ConversationDraft,
  template?: ConversationTemplate,
) {
  const blocks = [
    `谈话主题：${subject.type}`,
    `谈话时间：${input.happenedAt}`,
    `谈话地点：${input.location || "未填写"}`,
    "",
    `一、基本情况\n${studentName}：${subject.facts}`,
    template?.highlightStudentExpression === false
      ? undefined
      : `二、学生主要表达\n${input.studentExpression || input.rawNotes}`,
    template?.highlightCounselorGuidance === false
      ? undefined
      : `三、班主任沟通与引导\n${input.counselorGuidance || "围绕已确认事实进行沟通。"}`,
    `四、达成的共识/处理措施\n${input.agreements || "待进一步确认。"}`,
    template?.highlightFollowUp === false
      ? undefined
      : `五、后续跟进事项\n${input.followUpPlan || "按约定时间复查。"}`,
  ].filter(Boolean);
  const separator = template?.dividedParagraphs === false ? "\n" : "\n\n";
  return [
    template?.commonOpening,
    blocks.join(separator),
    template?.commonEnding,
  ]
    .filter(Boolean)
    .join(separator);
}

export async function completeEventConversation(
  store: V2LocalStore,
  input: ConversationInput,
) {
  return store.update((state) => {
    const event = state.events.find((item) => item.id === input.eventId);
    if (!event) throw new Error("关联事件不存在，无法保存谈话。 ");
    const student = state.students.find((item) => item.id === event.studentId);
    if (!student) throw new Error("关联学生不存在，无法保存谈话。 ");
    const createdAt = now();
    const template =
      state.conversationTemplates.find(
        (item) => item.id === input.templateId,
      ) ?? state.conversationTemplates.find((item) => item.isDefault);
    const conversation: ConversationRecord = {
      id: id("conversation"),
      studentId: student.id,
      eventId: event.id,
      scenario: event.type,
      templateId: template?.id,
      happenedAt: input.happenedAt,
      location: input.location,
      rawNotes: input.rawNotes,
      finalRecord: formatConversationRecord(
        student.name,
        event,
        input,
        template,
      ),
      studentExpression: input.studentExpression,
      counselorGuidance: input.counselorGuidance,
      agreements: input.agreements,
      followUpPlan: input.followUpPlan,
      nextFollowUpAt: input.nextFollowUpAt,
      aiUsed: false,
      createdAt,
    };
    state.conversations.push(conversation);
    event.relatedConversationIds.push(conversation.id);
    event.status = input.nextFollowUpAt ? "跟进中" : "已完成";
    for (const task of state.tasks)
      if (
        task.eventId === event.id &&
        task.type === "待谈话" &&
        task.status === "待处理"
      ) {
        task.status = "已完成";
        task.completedAt = createdAt;
        task.completionNote = "已完成谈话并形成记录。";
      }
    if (input.nextFollowUpAt) {
      const follow: TaskRecord = {
        id: id("task"),
        studentId: student.id,
        eventId: event.id,
        conversationId: conversation.id,
        type: "待复查",
        title: `复查“${event.type}”后续情况`,
        dueAt: input.nextFollowUpAt,
        priority: event.priority,
        status: "待处理",
        createdAt,
      };
      state.tasks.push(follow);
      event.relatedTaskIds.push(follow.id);
      student.status = "跟进中";
    } else student.status = "正常";
  });
}

export interface StandaloneConversationInput extends ConversationDraft {
  studentId: string;
  /** 谈话主题，写入 scenario；勾选留存事件时同时作为事件类型。 */
  topic: string;
  /** 谈话背景 / 起因（可选）。未填时用主题生成一句中性说明，不臆造事实。 */
  background?: string;
  /** 是否在「事务」里留存一条已完成记录。默认不勾选，谈话本身就是主记录。 */
  archiveEvent?: boolean;
  /** 是否需要后续复查提醒。默认不生成待办——谈话当下已处理完。 */
  needsFollowUpTask?: boolean;
}

/**
 * 直接发起的谈心谈话：老师主动找学生谈，没有前置的「待谈话」事件。
 *
 * 与 `completeEventConversation` 的区别：
 * - 不依赖既有事件，谈话记录可以独立存在（`eventId` 可缺省）；
 * - **不生成「待谈话」待办**——谈话此刻已经发生了，再排一条待谈办没有意义；
 * - 默认也不生成复查待办，只有老师显式勾选「需要复查提醒」时才建；
 * - 可以选择在「事务」里留存一条已完成记录，便于后续材料引用与追溯。
 */
export async function recordStandaloneConversation(
  store: V2LocalStore,
  input: StandaloneConversationInput,
) {
  return store.update((state) => {
    const student = state.students.find((item) => item.id === input.studentId);
    if (!student) throw new Error("关联学生不存在，无法保存谈话。 ");
    const createdAt = now();
    const template =
      state.conversationTemplates.find(
        (item) => item.id === input.templateId,
      ) ?? state.conversationTemplates.find((item) => item.isDefault);
    const background = input.background?.trim()
      ? input.background.trim()
      : `本次谈话围绕“${input.topic}”展开。`;
    const conversation: ConversationRecord = {
      id: id("conversation"),
      studentId: student.id,
      scenario: input.topic,
      templateId: template?.id,
      happenedAt: input.happenedAt,
      location: input.location,
      rawNotes: input.rawNotes,
      finalRecord: formatConversationRecord(
        student.name,
        { type: input.topic, facts: background },
        input,
        template,
      ),
      studentExpression: input.studentExpression,
      counselorGuidance: input.counselorGuidance,
      agreements: input.agreements,
      followUpPlan: input.followUpPlan,
      nextFollowUpAt: input.needsFollowUpTask ? input.nextFollowUpAt : undefined,
      aiUsed: false,
      createdAt,
    };

    // 可选的「事务」留痕：谈话本身就是处理过程，直接落到链路末端，不挂任何待办。
    // 没排复查 → 已结案（谈完就了结，不给老师留一个「确认结案」的仪式感点击）；
    // 排了复查 → 跟进中，等复查待办完成后由既有链路收口。
    let event: EventRecord | undefined;
    if (input.archiveEvent) {
      const withFollowUp = Boolean(
        input.needsFollowUpTask && input.nextFollowUpAt,
      );
      event = {
        id: id("event"),
        studentId: student.id,
        type: input.topic,
        occurredAt: input.happenedAt,
        sourceType: "teacher",
        sourceText: "由谈心谈话直接发起",
        facts: background,
        priority: "medium",
        status: withFollowUp ? "跟进中" : "已结案",
        needsConversation: false,
        needsFollowUp: false,
        relatedConversationIds: [conversation.id],
        relatedTaskIds: [],
        result: withFollowUp
          ? "已通过谈心谈话处理，等待复查。"
          : "已通过谈心谈话处理并结案。",
        closedAt: withFollowUp ? undefined : createdAt,
        createdAt,
      };
      state.events.unshift(event);
      conversation.eventId = event.id;
    }

    state.conversations.push(conversation);

    // 唯一的可选待办：老师明确想复查时才有，避免「谈完还欠一条待办」。
    if (input.needsFollowUpTask && input.nextFollowUpAt) {
      const follow: TaskRecord = {
        id: id("task"),
        studentId: student.id,
        eventId: event?.id,
        conversationId: conversation.id,
        type: "待复查",
        title: `复查“${input.topic}”后续情况`,
        dueAt: input.nextFollowUpAt,
        priority: "medium",
        status: "待处理",
        createdAt,
      };
      state.tasks.push(follow);
      if (event) event.relatedTaskIds.push(follow.id);
      student.status = "跟进中";
    } else student.status = "正常";
  });
}

export async function completeTask(
  store: V2LocalStore,
  taskId: string,
  note = "已核实并完成。",
) {
  return store.update((state) => {
    const task = state.tasks.find((item) => item.id === taskId);
    if (!task) throw new Error("待办不存在。 ");
    task.status = "已完成";
    task.completedAt = now();
    task.completionNote = note;
    if (!task.eventId) return;
    const event = state.events.find((item) => item.id === task.eventId);
    if (!event) return;
    const pending = state.tasks.some(
      (item) => item.eventId === event.id && item.status === "待处理",
    );
    if (!pending) {
      event.status = "已完成";
      const student = state.students.find(
        (item) => item.id === event.studentId,
      );
      if (student) student.status = "正常";
    }
  });
}

export async function closeEvent(
  store: V2LocalStore,
  eventId: string,
  result: string,
) {
  return store.update((state) => {
    const event = state.events.find((item) => item.id === eventId);
    if (!event) throw new Error("事件不存在。 ");
    if (
      state.tasks.some(
        (item) => item.eventId === eventId && item.status === "待处理",
      )
    )
      throw new Error("仍有关联待办未完成，请先处理或取消。 ");
    event.status = "已结案";
    event.result = result || "相关事项已核实并完成跟进。";
    event.closedAt = now();
  });
}

export async function saveGatewayResult(
  store: V2LocalStore,
  studentId: string,
  result: string,
  conversationId?: string,
) {
  return store.update((state) => {
    // 指定了谈话记录就精确写入那一条；否则回退到该生最近一条（保持旧调用可用）。
    // 不能只按 studentId 取「最新一条」：对历史记录做 AI 分析时会写错记录。
    const conversation = conversationId
      ? state.conversations.find(
          (item) =>
            item.id === conversationId && item.studentId === studentId,
        )
      : [...state.conversations]
          .reverse()
          .find((item) => item.studentId === studentId);
    if (!conversation)
      throw new Error("请先完成一次谈话，再保存 AI 成文结果。 ");
    conversation.finalRecord = result.trim();
    conversation.aiUsed = true;
    const event = state.events.find((item) => item.id === conversation.eventId);
    if (event)
      event.result = "已通过 AI Privacy Gateway 成文，并由班主任人工审核。";
  });
}

export function eventProgress(event: EventRecord, tasks: TaskRecord[]) {
  if (event.status === "已结案") return 5;
  if (event.status === "已完成") return 4;
  if (tasks.some((task) => task.eventId === event.id && task.type === "待复查"))
    return 3;
  if (event.relatedConversationIds.length) return 2;
  if (event.needsConversation) return 1;
  return 0;
}
