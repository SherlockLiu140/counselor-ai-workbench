import type { V2LocalStore } from "./store";
import { createId } from "./store";
import type {
  AwardApplication,
  AwardProject,
  AwardStatus,
  CareerPlan,
  ConversationTemplate,
  GraduationDirection,
  MaterialArchive,
  V2Space,
} from "./types";

const now = () => new Date().toISOString();

export async function createAwardProject(
  store: V2LocalStore,
  input: Omit<AwardProject, "id" | "createdAt">,
) {
  return store.update((state) => {
    if (!input.name.trim()) throw new Error("请填写项目名称。 ");
    state.awardProjects.unshift({
      ...input,
      id: createId("award-project"),
      name: input.name.trim(),
      requiredMaterials: input.requiredMaterials.filter(Boolean),
      createdAt: now(),
    });
  });
}

export async function addAwardCandidate(
  store: V2LocalStore,
  projectId: string,
  studentId: string,
  eligible: boolean,
) {
  return store.update((state) => {
    const project = state.awardProjects.find((item) => item.id === projectId);
    if (!project) throw new Error("评奖评优项目不存在。 ");
    if (!state.students.some((item) => item.id === studentId))
      throw new Error("候选学生不存在。 ");
    if (
      state.awardApplications.some(
        (item) => item.projectId === projectId && item.studentId === studentId,
      )
    )
      throw new Error("该学生已经在候选名单中。 ");
    const missing = [...project.requiredMaterials];
    state.awardApplications.unshift({
      id: createId("award-application"),
      projectId,
      studentId,
      type: project.type,
      year: project.year,
      eligible,
      status: eligible ? (missing.length ? "待补材料" : "材料齐全") : "待筛选",
      requiredMaterials: [...project.requiredMaterials],
      missingMaterials: missing,
      deadline: project.deadline,
      notes: "",
    });
  });
}

export async function updateAwardApplication(
  store: V2LocalStore,
  applicationId: string,
  patch: Partial<
    Pick<
      AwardApplication,
      "eligible" | "missingMaterials" | "status" | "result" | "notes"
    >
  >,
) {
  return store.update((state) => {
    const application = state.awardApplications.find(
      (item) => item.id === applicationId,
    );
    if (!application) throw new Error("候选记录不存在。 ");
    Object.assign(application, patch);
    if (patch.missingMaterials) {
      if (!patch.missingMaterials.length && application.status === "待补材料")
        application.status = "材料齐全";
      if (patch.missingMaterials.length && application.status === "材料齐全")
        application.status = "待补材料";
    }
  });
}

export async function bulkUpdateAwardStatus(
  store: V2LocalStore,
  applicationIds: string[],
  status: AwardStatus,
) {
  return store.update((state) => {
    for (const application of state.awardApplications)
      if (applicationIds.includes(application.id)) application.status = status;
  });
}

export async function upsertCareerPlan(store: V2LocalStore, plan: CareerPlan) {
  return store.update((state) => {
    if (!state.students.some((item) => item.id === plan.studentId))
      throw new Error("学生不存在。 ");
    const next = { ...structuredClone(plan), updatedAt: now() };
    const index = state.careerPlans.findIndex(
      (item) => item.studentId === plan.studentId,
    );
    if (index >= 0) state.careerPlans[index] = next;
    else state.careerPlans.push(next);
    const student = state.students.find((item) => item.id === plan.studentId)!;
    student.graduationDirection = plan.direction;
    student.updatedAt = now();
  });
}

export function isCareerStale(plan: CareerPlan, today = new Date()) {
  const value =
    plan.direction === "专升本"
      ? plan.furtherStudy?.lastFollowUp
      : plan.employment?.lastFollowUp;
  if (!value) return true;
  const boundary = new Date(today);
  boundary.setDate(boundary.getDate() - 30);
  return value < boundary.toISOString().slice(0, 10);
}

export function careerFilter(
  state: V2Space,
  filter:
    | "all"
    | "upgrade"
    | "no-direction"
    | "upgrade-no-plan"
    | "upgrade-no-school"
    | "no-resume"
    | "no-applications"
    | "stale"
    | "offer-unsigned"
    | "signed",
) {
  return state.students.filter((student) => {
    const plan = state.careerPlans.find(
      (item) => item.studentId === student.id,
    );
    const direction =
      plan?.direction ?? student.graduationDirection ?? "未明确";
    if (filter === "all") return true;
    if (filter === "upgrade") return direction === "专升本";
    if (filter === "no-direction") return direction === "未明确";
    if (filter === "upgrade-no-plan")
      return (
        direction === "专升本" && plan?.furtherStudy?.planStatus !== "已制定"
      );
    if (filter === "upgrade-no-school")
      return direction === "专升本" && !plan?.furtherStudy?.targetSchool;
    if (filter === "no-resume")
      return (
        direction === "就业" && plan?.employment?.resumeStatus !== "已完成"
      );
    if (filter === "no-applications")
      return direction === "就业" && !(plan?.employment?.applications ?? 0);
    if (filter === "stale") return !!plan && isCareerStale(plan);
    if (filter === "offer-unsigned")
      return (
        direction === "就业" &&
        (plan?.employment?.offers ?? 0) > 0 &&
        !plan?.employment?.signed
      );
    return direction === "就业" && !!plan?.employment?.signed;
  });
}

export function careerDirectionCounts(state: V2Space) {
  const directions: GraduationDirection[] = [
    "专升本",
    "就业",
    "考公 / 考编",
    "创业",
    "其他",
    "未明确",
  ];
  return directions.map((direction) => ({
    direction,
    count: state.students.filter((student) => {
      const plan = state.careerPlans.find(
        (item) => item.studentId === student.id,
      );
      const current =
        plan?.direction ?? student.graduationDirection ?? "未明确";
      return direction === "考公 / 考编"
        ? current === direction || current === "考公考编"
        : current === direction;
    }).length,
  }));
}

export async function replaceConversationTemplates(
  store: V2LocalStore,
  templates: ConversationTemplate[],
) {
  return store.update((state) => {
    const ids = new Set<string>();
    for (const template of templates) {
      if (!template.id || !template.name.trim() || ids.has(template.id))
        throw new Error("模板数据无效或 ID 重复。 ");
      ids.add(template.id);
    }
    if (!templates.some((item) => item.isDefault))
      throw new Error("至少需要一个默认模板。 ");
    state.conversationTemplates = structuredClone(templates);
  });
}

export async function saveMaterialArchive(
  store: V2LocalStore,
  input: Omit<MaterialArchive, "id" | "createdAt">,
) {
  return store.update((state) => {
    state.materialArchives.unshift({
      ...input,
      id: createId("material"),
      createdAt: now(),
    });
  });
}
