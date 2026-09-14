import { saveExportFile } from "./desktop";
import type { MaterialArchive, StudentRecord, V2Space } from "./types";

export type MaterialType =
  | "conversation"
  | "follow-up"
  | "absence"
  | "academic"
  | "internship"
  | "employment"
  | "upgrade"
  | "award-recommendation"
  | "award-material"
  | "class-summary"
  | "student-system";

export const materialTypeLabels: Record<MaterialType, string> = {
  conversation: "谈心谈话记录",
  "follow-up": "学生跟进记录",
  absence: "缺勤情况及谈话跟进记录",
  academic: "学业问题跟进",
  internship: "实习回访",
  employment: "就业跟进",
  upgrade: "专升本跟进",
  "award-recommendation": "奖助推荐意见",
  "award-material": "评优材料",
  "class-summary": "班级阶段工作总结",
  "student-system": "学工系统可复制版本",
};

export interface GeneratedMaterial extends Omit<
  MaterialArchive,
  "id" | "createdAt" | "aiUsed"
> {
  aiUsed: false;
}

const studentName = (state: V2Space, id?: string) =>
  state.students.find((student) => student.id === id)?.name ?? "未指定学生";

function studentContext(state: V2Space, student: StudentRecord) {
  const events = state.events.filter((item) => item.studentId === student.id);
  const conversations = state.conversations.filter(
    (item) => item.studentId === student.id,
  );
  const tasks = state.tasks.filter((item) => item.studentId === student.id);
  return { events, conversations, tasks };
}

function requireStudent(state: V2Space, studentId?: string) {
  const student = state.students.find((item) => item.id === studentId);
  if (!student) throw new Error("请选择学生后再生成该材料。 ");
  return student;
}

function lines(values: Array<string | undefined | false>) {
  return values.filter(Boolean).join("\n");
}

export function generateLocalMaterial(
  state: V2Space,
  type: MaterialType,
  studentId?: string,
): GeneratedMaterial {
  if (type === "class-summary") {
    const pending = state.tasks.filter((item) => item.status === "待处理");
    const completedEvents = state.events.filter((item) =>
      ["已完成", "已结案"].includes(item.status),
    );
    const directions = [
      "专升本",
      "就业",
      "考公 / 考编",
      "创业",
      "其他",
      "未明确",
    ].map(
      (direction) =>
        `${direction}：${
          state.students.filter((student) => {
            const plan = state.careerPlans.find(
              (item) => item.studentId === student.id,
            );
            const current =
              plan?.direction ?? student.graduationDirection ?? "未明确";
            return direction === "考公 / 考编"
              ? current === direction || current === "考公考编"
              : current === direction;
          }).length
        } 人`,
    );
    return {
      type,
      title: materialTypeLabels[type],
      sourceEventIds: state.events.map((item) => item.id),
      sourceConversationIds: state.conversations.map((item) => item.id),
      content: lines([
        "班级阶段工作总结",
        "",
        `一、班级概况\n当前共 ${state.students.length} 名学生，${state.classes.length} 个班级。`,
        `二、事务办理\n本阶段登记 ${state.events.length} 项事务，其中完成或结案 ${completedEvents.length} 项。`,
        `三、谈心谈话与跟进\n已形成 ${state.conversations.length} 份谈话记录；当前待办 ${pending.length} 项。`,
        `四、升学就业\n${directions.join("；")}。`,
        "五、下一阶段\n继续按现有待办和复查节点推进，重要事实以学校正式系统记录为准。",
      ]),
      aiUsed: false,
    };
  }

  const student = requireStudent(state, studentId);
  const { events, conversations, tasks } = studentContext(state, student);
  const latestConversation = [...conversations].sort((a, b) =>
    b.happenedAt.localeCompare(a.happenedAt),
  )[0];
  const eventKinds: Record<MaterialType, string[]> = {
    conversation: [],
    "follow-up": [],
    absence: ["缺勤", "迟到", "请假异常"],
    academic: ["挂科", "成绩下降", "学习困难"],
    internship: ["实习异常"],
    employment: ["就业"],
    upgrade: ["专升本"],
    "award-recommendation": ["奖助"],
    "award-material": ["评优"],
    "class-summary": [],
    "student-system": [],
  };
  const relevantEvents = eventKinds[type].length
    ? events.filter((event) => eventKinds[type].includes(event.type))
    : events;
  const completedTasks = tasks.filter((task) => task.status === "已完成");
  const career = state.careerPlans.find(
    (item) => item.studentId === student.id,
  );
  const award = state.awardApplications.find(
    (item) => item.studentId === student.id,
  );
  const project = state.awardProjects.find(
    (item) => item.id === award?.projectId,
  );

  let content = "";
  if (type === "conversation" || type === "student-system")
    content = latestConversation?.finalRecord ?? "尚无已完成的谈话记录。";
  else if (type === "follow-up")
    content = lines([
      `${student.name}跟进记录`,
      ...completedTasks.map(
        (task) =>
          `${task.completedAt?.slice(0, 10) ?? "日期未记录"}｜${task.title}｜${task.completionNote ?? "已完成"}`,
      ),
    ]);
  else if (["absence", "academic", "internship"].includes(type))
    content = lines([
      `${student.name}${materialTypeLabels[type]}`,
      "",
      "一、已记录事实",
      ...relevantEvents.map(
        (event) => `${event.occurredAt}｜${event.type}｜${event.facts}`,
      ),
      "",
      "二、谈话与处理",
      ...conversations
        .filter((item) =>
          relevantEvents.some((event) => item.eventId === event.id),
        )
        .map((item) => item.finalRecord || item.rawNotes),
      "",
      "三、跟进结果",
      ...relevantEvents.flatMap((event) => {
        const results = completedTasks
          .filter((task) => task.eventId === event.id)
          .map(
            (task) =>
              `${task.completedAt?.slice(0, 10) ?? "日期未记录"}｜${task.title}｜${task.completionNote ?? "已完成"}`,
          );
        return results.length
          ? results
          : [`${event.status}｜${event.result ?? "按关联待办继续跟进"}`];
      }),
    ]);
  else if (type === "employment")
    content = lines([
      `${student.name}就业跟进记录`,
      `求职方向：${career?.employment?.targetRole || "未明确"}`,
      `地域意向：${career?.employment?.preferredRegion || "未明确"}`,
      `简历状态：${career?.employment?.resumeStatus || "未记录"}`,
      `投递 / 面试 / offer：${career?.employment?.applications ?? 0} / ${career?.employment?.interviews ?? 0} / ${career?.employment?.offers ?? 0}`,
      `签约状态：${career?.employment?.signed ? "已签约" : "未签约"}`,
      `下一步：${career?.employment?.nextStep || "待确定"}`,
    ]);
  else if (type === "upgrade")
    content = lines([
      `${student.name}专升本跟进记录`,
      `目标院校：${career?.furtherStudy?.targetSchool || "未明确"}`,
      `目标专业：${career?.furtherStudy?.targetMajor || "未明确"}`,
      `当前阶段：${career?.furtherStudy?.stage || "未记录"}`,
      `计划状态：${career?.furtherStudy?.planStatus || "未制定"}`,
      `最近复习：${career?.furtherStudy?.recentStudy || "未记录"}`,
      `模考记录：${
        career?.furtherStudy?.mockExamRecords?.length
          ? career.furtherStudy.mockExamRecords
              .map(
                (item) =>
                  `${item.date}${item.score === undefined ? "" : ` ${item.score} 分`}${item.notes ? `（${item.notes}）` : ""}`,
              )
              .join("；")
          : "未记录"
      }`,
      `当前困难：${career?.furtherStudy?.difficulties || "未记录"}`,
      `下次跟进：${career?.furtherStudy?.nextFollowUp || "未设置"}`,
    ]);
  else
    content = lines([
      `${student.name}${materialTypeLabels[type]}`,
      `项目：${project?.name || award?.type || "未选择项目"}`,
      `年度 / 学期：${project?.year || award?.year || "未填写"}${project?.term ? ` / ${project.term}` : ""}`,
      `条件核对：${award?.eligible ? "已标记符合" : "待核实"}`,
      `材料状态：${award?.missingMaterials.length ? `缺少 ${award.missingMaterials.join("、")}` : "材料齐全"}`,
      `办理状态：${award?.status || "待筛选"}`,
      `结果：${award?.result || "尚未形成"}`,
      `备注：${award?.notes || "无"}`,
    ]);

  return {
    type,
    title: `${student.name}｜${materialTypeLabels[type]}`,
    studentId: student.id,
    sourceEventIds: relevantEvents.map((item) => item.id),
    sourceConversationIds: conversations.map((item) => item.id),
    content,
    aiUsed: false,
  };
}

export async function downloadText(title: string, content: string) {
  return saveExportFile(
    `${title.replace(/[\\/:*?"<>|]/g, "-")}.txt`,
    content,
    "text/plain;charset=utf-8",
  );
}
