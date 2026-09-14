import { describe, expect, it } from "vitest";
import { demoStudents } from "../src/demo/data";
import {
  addAwardCandidate,
  careerDirectionCounts,
  careerFilter,
  createAwardProject,
  replaceConversationTemplates,
  saveMaterialArchive,
  updateAwardApplication,
  upsertCareerPlan,
} from "../src/v2/business";
import { generateLocalMaterial } from "../src/v2/materials";
import { buildMinimumTalkSource } from "../src/v2/PrivacyGateway";
import { dashboardMetrics } from "../src/v2/selectors";
import {
  V2MemoryStore,
  addTaskRecord,
  importV1Students,
  registerEvent,
} from "../src/v2/store";
import {
  completeEventConversation,
  completeTask,
  formatConversationRecord,
} from "../src/v2/workflow";

async function localSpace(count = 3) {
  const store = new V2MemoryStore();
  const state = await importV1Students(store, demoStudents.slice(0, count));
  return { store, state };
}

describe("workbench business modules", () => {
  it("runs an award candidate from missing materials to passed and keeps the student link", async () => {
    const { store, state } = await localSpace(2);
    let next = await createAwardProject(store, {
      name: "2026 年优秀学生干部评选",
      type: "优秀学生干部",
      year: "2026",
      term: "秋季学期",
      deadline: "2026-09-18",
      requiredMaterials: ["申请表", "成绩单", "事迹材料"],
      notes: "虚构验收项目",
    });
    const project = next.awardProjects[0];
    next = await addAwardCandidate(
      store,
      project.id,
      state.students[0].id,
      true,
    );
    const application = next.awardApplications[0];
    expect(application).toMatchObject({
      studentId: state.students[0].id,
      status: "待补材料",
      missingMaterials: ["申请表", "成绩单", "事迹材料"],
    });
    next = await updateAwardApplication(store, application.id, {
      missingMaterials: [],
    });
    expect(next.awardApplications[0].status).toBe("材料齐全");
    await updateAwardApplication(store, application.id, { status: "已提交" });
    next = await updateAwardApplication(store, application.id, {
      status: "通过",
      result: "经虚构评审通过",
    });
    expect(next.awardApplications[0]).toMatchObject({
      studentId: state.students[0].id,
      status: "通过",
      result: "经虚构评审通过",
    });
  });

  it("supports an upgrade plan, a related talk and a two-week follow-up task", async () => {
    const { store, state } = await localSpace(1);
    const student = state.students[0];
    expect(careerFilter(state, "no-direction")).toHaveLength(1);
    let next = await upsertCareerPlan(store, {
      studentId: student.id,
      direction: "专升本",
      furtherStudy: {
        targetSchool: "虚构应用技术学院",
        targetMajor: "软件工程",
        stage: "基础复习",
        planStatus: "已制定",
        lastFollowUp: "2026-09-11",
        nextFollowUp: "2026-09-25",
      },
    });
    expect(careerFilter(next, "upgrade-no-plan")).toHaveLength(0);
    next = await registerEvent(store, {
      studentId: student.id,
      type: "专升本",
      occurredAt: "2026-09-11",
      sourceType: "self",
      facts: "需要核对复习计划与目标。",
      priority: "medium",
      needsConversation: true,
      needsFollowUp: true,
    });
    expect(next.tasks.some((item) => item.type === "待谈话")).toBe(true);
    next = await addTaskRecord(store, {
      studentId: student.id,
      eventId: next.events[0].id,
      type: "待复查",
      title: "两周后复盘专升本计划",
      dueAt: "2026-09-25",
      priority: "medium",
    });
    expect(
      next.tasks.some(
        (item) =>
          item.title === "两周后复盘专升本计划" && item.status === "待处理",
      ),
    ).toBe(true);
  });

  it("tracks employment resume, applications, interviews and offer progress", async () => {
    const { store, state } = await localSpace(1);
    const student = state.students[0];
    let next = await upsertCareerPlan(store, {
      studentId: student.id,
      direction: "就业",
      employment: {
        targetRole: "前端开发助理",
        resumeStatus: "无简历",
        applications: 0,
        interviews: 0,
        offers: 0,
        signed: false,
      },
    });
    expect(careerFilter(next, "no-resume")).toHaveLength(1);
    next = await addTaskRecord(store, {
      studentId: student.id,
      type: "待核实",
      title: "完成简历并更新投递进度",
      dueAt: "2026-09-18",
      priority: "medium",
    });
    next = await upsertCareerPlan(store, {
      studentId: student.id,
      direction: "就业",
      employment: {
        targetRole: "前端开发助理",
        resumeStatus: "已完成",
        applications: 6,
        interviews: 2,
        offers: 1,
        signed: false,
        lastFollowUp: "2026-09-11",
        nextStep: "核对 offer 条款",
      },
    });
    expect(next.careerPlans[0].employment).toMatchObject({
      applications: 6,
      interviews: 2,
      offers: 1,
      signed: false,
    });
    expect(careerFilter(next, "offer-unsigned")).toHaveLength(1);
  });

  it("applies the personal default talk template and keeps unrelated sensitive data out of the AI source", async () => {
    const { store, state } = await localSpace(1);
    const student = state.students[0];
    const personal = {
      ...state.conversationTemplates[0],
      id: "conversation-template:personal",
      name: "我的自然记录",
      tone: "自然" as const,
      person: "第一人称" as const,
      defaultLength: 260,
      commonOpening: "我与学生围绕近期情况进行了沟通。",
      commonEnding: "后续将按约定节点继续关注。",
      writingStyle: "避免公文套话，保留学生表达。",
      customPromptRules: "不使用“深刻认识到”。",
      isDefault: true,
      createdByUser: true,
    };
    const templates = [
      ...state.conversationTemplates.map((item) => ({
        ...item,
        isDefault: false,
      })),
      personal,
    ];
    let next = await replaceConversationTemplates(store, templates);
    next = await store.update((draft) => {
      draft.sensitiveProfiles.push({
        studentId: student.id,
        religion: "虚构宗教字段",
        sexualOrientation: "虚构性取向字段",
        psychologicalNotes: "虚构心理备注",
        customFields: [],
      });
    });
    const event = {
      id: "event:personal-talk",
      studentId: student.id,
      type: "情感问题",
      occurredAt: "2026-09-11",
      sourceType: "self" as const,
      facts: "近期情感关系发生变化，饮食和学习状态受到影响。",
      priority: "medium" as const,
      status: "待处理" as const,
      needsConversation: true,
      needsFollowUp: true,
      relatedConversationIds: [],
      relatedTaskIds: [],
      createdAt: "2026-09-11T08:00:00.000Z",
    };
    const record = formatConversationRecord(
      student.name,
      event,
      {
        templateId: personal.id,
        happenedAt: "2026-09-11",
        rawNotes:
          "最近分手，吃不下饭，成绩下降，我建议多出去走走并和朋友交流。",
        studentExpression: "近期饮食和学习受到影响。",
        counselorGuidance: "建议保持日常活动并使用身边支持。",
        agreements: "有需要继续沟通。",
        followUpPlan: "一周后了解近况。",
      },
      personal,
    );
    expect(record).toContain(personal.commonOpening);
    expect(record).toContain(personal.commonEnding);

    await registerEvent(store, {
      studentId: student.id,
      type: event.type,
      occurredAt: event.occurredAt,
      sourceType: event.sourceType,
      facts: event.facts,
      priority: event.priority,
      needsConversation: true,
      needsFollowUp: true,
    });
    const storedEvent = (await store.read()).events[0];
    next = await completeEventConversation(store, {
      eventId: storedEvent.id,
      templateId: personal.id,
      happenedAt: "2026-09-11",
      rawNotes: "近期情感关系发生变化，饮食和学习状态受到影响。",
      studentExpression: "近期饮食和学习受到影响。",
      counselorGuidance: "建议保持日常活动并使用身边支持。",
      agreements: "有需要继续沟通。",
      followUpPlan: "一周后了解近况。",
    });
    const source = buildMinimumTalkSource(next, student);
    expect(source).toContain("避免公文套话");
    expect(source).not.toContain("虚构宗教字段");
    expect(source).not.toContain("虚构性取向字段");
    expect(source).not.toContain(student.phone);
  });

  it("reuses an absence event, talk and follow-up result for material output and local archive", async () => {
    const { store, state } = await localSpace(1);
    const student = state.students[0];
    let next = await registerEvent(store, {
      studentId: student.id,
      type: "缺勤",
      occurredAt: "2026-09-11",
      sourceType: "class_committee",
      facts: "第一、二节课未到，原因待核实。",
      priority: "medium",
      needsConversation: true,
      needsFollowUp: true,
    });
    const event = next.events[0];
    next = await completeEventConversation(store, {
      eventId: event.id,
      happenedAt: "2026-09-11",
      rawNotes: "学生说明当天身体不适。",
      studentExpression: "已补看课程资料。",
      counselorGuidance: "核对请假流程。",
      agreements: "按流程请假。",
      followUpPlan: "复查后续考勤。",
      nextFollowUpAt: "2026-09-18",
    });
    const follow = next.tasks.find((item) => item.type === "待复查")!;
    next = await completeTask(store, follow.id, "复查期间无新增缺勤。 ");
    const draft = generateLocalMaterial(next, "absence", student.id);
    expect(draft.content).toContain("第一、二节课未到");
    expect(draft.content).toContain("已补看课程资料");
    expect(draft.content).toContain("复查期间无新增缺勤");
    next = await saveMaterialArchive(store, draft);
    expect(next.materialArchives[0]).toMatchObject({
      studentId: student.id,
      aiUsed: false,
    });
  });

  it("derives dashboard award and career figures from local records", async () => {
    const { store, state } = await localSpace(2);
    await upsertCareerPlan(store, {
      studentId: state.students[0].id,
      direction: "专升本",
      furtherStudy: { planStatus: "未制定" },
    });
    await upsertCareerPlan(store, {
      studentId: state.students[1].id,
      direction: "就业",
      employment: { resumeStatus: "无简历", lastFollowUp: "2026-01-01" },
    });
    let next = await createAwardProject(store, {
      name: "虚构助学金",
      type: "助学金",
      year: "2026",
      requiredMaterials: ["申请表"],
    });
    next = await addAwardCandidate(
      store,
      next.awardProjects[0].id,
      state.students[0].id,
      true,
    );
    const metrics = dashboardMetrics(next, "2026-09-11");
    expect(metrics).toMatchObject({
      furtherStudyCount: 1,
      directionUnknownCount: 0,
      awardPendingCount: 1,
      awardMissingCount: 1,
      employmentStaleCount: 1,
    });
    expect(careerDirectionCounts(next)).toContainEqual({
      direction: "就业",
      count: 1,
    });
  });
});
