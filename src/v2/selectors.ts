import type { EventRecord, StudentRecord, TaskRecord, V2Space } from "./types";
import { isCareerStale } from "./business";

const day = (date = new Date()) => date.toISOString().slice(0, 10);

export function dashboardMetrics(space: V2Space, today = day()) {
  const overdue = space.tasks.filter(
    (task) => task.status === "待处理" && task.dueAt && task.dueAt < today,
  );
  return {
    totalStudents: space.students.length,
    specialCareCount: space.students.filter((student) => student.specialCare).length,
    todayAbsence: space.attendanceRecords.filter(
      (record) => record.date === today && record.type === "absent",
    ).length,
    weekAbsence: space.attendanceRecords.filter((record) => {
      const end = new Date(`${today}T00:00:00`);
      const start = new Date(end);
      start.setDate(start.getDate() - 6);
      return record.type === "absent" && record.date >= start.toISOString().slice(0, 10) && record.date <= today;
    }).length,
    pendingConversation: space.tasks.filter(
      (task) => task.status === "待处理" && task.type === "待谈话",
    ).length,
    pendingFollowUp: space.tasks.filter(
      (task) =>
        task.status === "待处理" && ["待复查", "待回访"].includes(task.type),
    ).length,
    academicConcernCount: space.students.filter((student) => {
      const records = space.academicRecords.filter((record) => record.studentId === student.id);
      const previous = records.find((record) => record.term === "上次");
      const latest = records.find((record) => record.term === "最近");
      return records.some((record) => record.failed || (record.failedCount ?? 0) > 0) ||
        (previous?.score !== undefined && latest?.score !== undefined && latest.score < previous.score);
    }).length,
    failedStudentCount: new Set(
      space.academicRecords
        .filter((record) => record.failed || (record.failedCount ?? 0) > 0)
        .map((record) => record.studentId),
    ).size,
    overdueTasks: overdue.length,
    furtherStudyCount: space.students.filter((student) => {
      const plan = space.careerPlans.find(
        (item) => item.studentId === student.id,
      );
      return (plan?.direction ?? student.graduationDirection) === "专升本";
    }).length,
    directionUnknownCount: space.students.filter((student) => {
      const plan = space.careerPlans.find(
        (item) => item.studentId === student.id,
      );
      const direction =
        plan?.direction ?? student.graduationDirection ?? "未明确";
      return direction === "未明确";
    }).length,
    awardPendingCount: space.awardApplications.filter(
      (item) => !["通过", "未通过", "已归档"].includes(item.status),
    ).length,
    awardMissingCount: space.awardApplications.filter(
      (item) => item.missingMaterials.length > 0,
    ).length,
    employmentStaleCount: space.careerPlans.filter(
      (plan) => plan.direction === "就业" && isCareerStale(plan),
    ).length,
  };
}

export type AgendaKind = "overdue" | "today" | "talk";

export interface AgendaEntry {
  task: TaskRecord;
  kind: AgendaKind;
}

const priorityRank = { high: 0, medium: 1, low: 2 } as const;

/**
 * 首页「今日清单」口径：只收已逾期、今天到期与待谈话三类未完成事项，
 * 按截止时间再按优先级排序。不含未来到期事项，避免与「全部待办」重复。
 */
export function todayAgenda(space: V2Space, today = day()) {
  const open = space.tasks.filter((task) => task.status === "待处理");
  const byUrgency = (a: TaskRecord, b: TaskRecord) =>
    (a.dueAt ?? "9999-12-31").localeCompare(b.dueAt ?? "9999-12-31") ||
    priorityRank[a.priority] - priorityRank[b.priority];

  const overdue = open
    .filter((task) => !!task.dueAt && task.dueAt < today)
    .sort(byUrgency);
  const dueToday = open.filter((task) => task.dueAt === today).sort(byUrgency);
  const talk = open
    .filter((task) => task.type === "待谈话" && !(task.dueAt && task.dueAt <= today))
    .sort(byUrgency);

  const entries: AgendaEntry[] = [
    ...overdue.map((task) => ({ task, kind: "overdue" as const })),
    ...dueToday.map((task) => ({ task, kind: "today" as const })),
    ...talk.map((task) => ({ task, kind: "talk" as const })),
  ];

  return {
    entries,
    counts: {
      overdue: overdue.length,
      dueToday: dueToday.length,
      talk: open.filter((task) => task.type === "待谈话").length,
      open: open.length,
    },
  };
}

/** 本地日历日（YYYY-MM-DD），与 `day()` 的口径一致，避免跨时区串日。 */
const localDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;

const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

/**
 * 首页「今日推进」口径：今天需要处理的事项（今天到期、已逾期、待谈话）中，
 * 已完成与未完成各多少。已完成项按 completedAt 归入当天，所以勾选时分子 +1、
 * 分母不变，进度条不会回跳。
 */
export function todayProgress(space: V2Space, today = day()) {
  const onPlate = (task: TaskRecord) =>
    task.type === "待谈话" || (!!task.dueAt && task.dueAt <= today);
  const done = space.tasks.filter(
    (task) =>
      task.status === "已完成" &&
      (task.completedAt ?? "").slice(0, 10) === today &&
      onPlate(task),
  ).length;
  const open = space.tasks.filter(
    (task) => task.status === "待处理" && onPlate(task),
  ).length;
  return { done, open, total: done + open };
}

export interface WeekRhythmDay {
  key: string;
  weekday: string;
  date: number;
  isToday: boolean;
  count: number;
}

/**
 * 首页「本周节奏」口径：周一至周日每天的未完成事项数，用于一眼看出哪几天有安排。
 * 只数未完成项，所以过去的日期若仍有未办事项会留点，等同于逾期提示。
 */
export function weekRhythm(space: V2Space, today = day()): WeekRhythmDay[] {
  const base = new Date(`${today}T00:00:00`);
  const offset = (base.getDay() + 6) % 7;
  const open = space.tasks.filter(
    (task) => task.status === "待处理" && !!task.dueAt,
  );
  return WEEKDAY_LABELS.map((weekday, index) => {
    const cursor = new Date(base);
    cursor.setDate(base.getDate() - offset + index);
    const key = localDay(cursor);
    return {
      key,
      weekday,
      date: cursor.getDate(),
      isToday: key === today,
      count: open.filter((task) => task.dueAt === key).length,
    };
  });
}

/** 「接下来」的前瞻窗口：只看到未来 7 天内，与「本周节奏」同一时间尺度。 */
export const UPCOMING_WINDOW_DAYS = 7;

/**
 * 首页「接下来」口径：未来 7 天内到期的未完成事项。
 * 两条边界都是为了避免同一事项在首页出现两次：
 * 1. 排除「待谈话」——`todayAgenda` 已把全部待谈话（含未来到期）列入今日清单；
 * 2. 只取 7 天窗口——更远的事项由下方「今天先做什么」统一承担，此处不重复。
 */
export function upcomingTasks(space: V2Space, today = day(), limit = 3) {
  const until = new Date(`${today}T00:00:00`);
  until.setDate(until.getDate() + UPCOMING_WINDOW_DAYS);
  const windowEnd = localDay(until);
  return space.tasks
    .filter(
      (task) =>
        task.status === "待处理" &&
        task.type !== "待谈话" &&
        !!task.dueAt &&
        task.dueAt > today &&
        task.dueAt <= windowEnd,
    )
    .sort(
      (a, b) =>
        (a.dueAt ?? "").localeCompare(b.dueAt ?? "") ||
        priorityRank[a.priority] - priorityRank[b.priority],
    )
    .slice(0, limit);
}

export function studentTaskCount(tasks: TaskRecord[], studentId: string) {
  return tasks.filter(
    (task) => task.studentId === studentId && task.status === "待处理",
  ).length;
}

export function eventsForStudent(events: EventRecord[], studentId: string) {
  return events
    .filter((event) => event.studentId === studentId)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

export function filterStudents(
  students: StudentRecord[],
  options: { classId?: string; query?: string; status?: string; tag?: string },
) {
  const query = options.query?.trim().toLocaleLowerCase() ?? "";
  return students.filter(
    (student) =>
      (!options.classId || student.classId === options.classId) &&
      (!options.status || student.status === options.status) &&
      (!options.tag || student.tags.includes(options.tag)) &&
      (!query ||
        student.name.toLocaleLowerCase().includes(query) ||
        student.studentNo.toLocaleLowerCase().includes(query) ||
        student.phone?.includes(query)),
  );
}
