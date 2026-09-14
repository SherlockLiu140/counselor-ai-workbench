import { expect, it } from "vitest";
import { detect } from "../src/engine/engine";
import { defaultOptions } from "../src/engine/types";
import { demoStudents } from "../src/demo/data";
import {
  todayAgenda,
  todayProgress,
  upcomingTasks,
  weekRhythm,
} from "../src/v2/selectors";
import { emptyV2Space } from "../src/v2/store";
import type { TaskRecord, V2Space } from "../src/v2/types";
// Labelled source spans, not detector-generated expected values. These synthetic results do not estimate real-world accuracy.
const positive = [
  "陈晨",
  "20260003",
  "13900000003",
  "student3@example.invalid",
  "2025级虚构信息技术1班",
  "1栋303室",
  "2026年3月15日",
  "确诊为焦虑症",
  "父亲近期失业",
  "浙江省绍兴市虚构区示例路18号",
];
const negative = [
  "大二学生",
  "三周迟到3次",
  "两门课程成绩下降",
  "准备技能竞赛",
  "表达专升本意愿",
  "每周安排6小时复习",
];
it("measures recall and false positives on fictional labelled corpus", () => {
  const context = {
    students: demoStudents,
    codes: Object.fromEntries(
      demoStudents.map((s, i) => [s.id, `S${String(i + 1).padStart(3, "0")}`]),
    ),
    options: defaultOptions,
    customRules: [],
  };
  const tp = positive.filter((text) =>
    detect({ ...context, text }).some(
      (f) => f.start === 0 && f.end === text.length,
    ),
  ).length;
  const fp = negative.filter(
    (text) => detect({ ...context, text }).length > 0,
  ).length;
  console.info(
    JSON.stringify({
      corpus: "fictional-v1",
      labelledPositiveSpans: positive.length,
      negativeSegments: negative.length,
      truePositives: tp,
      falsePositives: fp,
      recall: tp / positive.length,
      falsePositiveSegmentRate: fp / negative.length,
    }),
  );
  expect(tp).toBe(positive.length);
  expect(fp).toBe(0);
});

function makeTask(over: Partial<TaskRecord> & { id: string }): TaskRecord {
  return {
    type: "待谈话",
    title: "事项",
    priority: "medium",
    status: "待处理",
    createdAt: "2026-09-01T00:00:00.000Z",
    ...over,
  };
}

it("首页今日清单只收逾期、今天到期与待谈话三类", () => {
  const space: V2Space = {
    ...emptyV2Space(),
    tasks: [
      makeTask({ id: "t-late-2", dueAt: "2026-09-11", type: "待联系", priority: "low" }),
      makeTask({ id: "t-late-1", dueAt: "2026-09-09", type: "待收材料", priority: "high" }),
      makeTask({ id: "t-today-1", dueAt: "2026-09-12", priority: "high" }),
      makeTask({ id: "t-talk" }),
      makeTask({ id: "t-done", dueAt: "2026-09-12", status: "已完成" }),
    ],
  };
  const agenda = todayAgenda(space, "2026-09-12");
  expect(agenda.entries.map((entry) => entry.task.id)).toEqual([
    "t-late-1",
    "t-late-2",
    "t-today-1",
    "t-talk",
  ]);
  expect(agenda.entries.map((entry) => entry.kind)).toEqual([
    "overdue",
    "overdue",
    "today",
    "talk",
  ]);
  expect(agenda.counts).toEqual({ overdue: 2, dueToday: 1, talk: 2, open: 4 });
});

it("未来到期事项不进入今日清单，避免与全部待办重复", () => {
  const space: V2Space = {
    ...emptyV2Space(),
    tasks: [
      makeTask({
        id: "t-future",
        dueAt: "2026-09-26",
        type: "待复查",
        title: "两周后复盘专升本计划",
      }),
    ],
  };
  const agenda = todayAgenda(space, "2026-09-12");
  expect(agenda.entries).toHaveLength(0);
  expect(agenda.counts).toEqual({ overdue: 0, dueToday: 0, talk: 0, open: 1 });
});

it("没有学生数据时今日清单为空", () => {
  const agenda = todayAgenda(emptyV2Space(), "2026-09-12");
  expect(agenda.entries).toHaveLength(0);
  expect(agenda.counts.overdue).toBe(0);
});

it("今日推进：勾选完成后分子加一、分母不变", () => {
  const late = makeTask({ id: "t-late", dueAt: "2026-09-11", type: "待联系" });
  const open = makeTask({ id: "t-open", dueAt: "2026-09-12" });

  const before: V2Space = { ...emptyV2Space(), tasks: [late, open] };
  const first = todayProgress(before, "2026-09-12");
  expect(first).toEqual({ done: 0, open: 2, total: 2 });

  const after: V2Space = {
    ...emptyV2Space(),
    tasks: [
      late,
      { ...open, status: "已完成", completedAt: "2026-09-12T02:00:00.000Z" },
    ],
  };
  const second = todayProgress(after, "2026-09-12");
  expect(second).toEqual({ done: 1, open: 1, total: 2 });
  expect(second.total).toBe(first.total);
});

it("今日推进：只算今天完成的，未来无关事项不进分母", () => {
  const space: V2Space = {
    ...emptyV2Space(),
    tasks: [
      makeTask({
        id: "t-done-today",
        dueAt: "2026-09-12",
        status: "已完成",
        completedAt: "2026-09-12T01:00:00.000Z",
      }),
      makeTask({
        id: "t-done-yesterday",
        dueAt: "2026-09-12",
        status: "已完成",
        completedAt: "2026-09-11T01:00:00.000Z",
      }),
      makeTask({ id: "t-future", dueAt: "2026-09-26", type: "待复查" }),
      makeTask({ id: "t-talk" }),
    ],
  };
  expect(todayProgress(space, "2026-09-12")).toEqual({
    done: 1,
    open: 1,
    total: 2,
  });
});

it("本周节奏：按周一到周日归集，已完成与下周事项不计入", () => {
  const space: V2Space = {
    ...emptyV2Space(),
    tasks: [
      makeTask({ id: "w-mon", dueAt: "2026-09-07", type: "待联系" }),
      makeTask({ id: "w-sat", dueAt: "2026-09-12" }),
      makeTask({
        id: "w-sat-done",
        dueAt: "2026-09-12",
        status: "已完成",
        completedAt: "2026-09-12T01:00:00.000Z",
      }),
      makeTask({ id: "w-next", dueAt: "2026-09-20", type: "待回访" }),
    ],
  };
  const week = weekRhythm(space, "2026-09-12");
  expect(week.map((day) => day.key)).toEqual([
    "2026-09-07",
    "2026-09-08",
    "2026-09-09",
    "2026-09-10",
    "2026-09-11",
    "2026-09-12",
    "2026-09-13",
  ]);
  expect(week.map((day) => day.weekday)).toEqual([
    "一",
    "二",
    "三",
    "四",
    "五",
    "六",
    "日",
  ]);
  expect(week.map((day) => day.count)).toEqual([1, 0, 0, 0, 0, 1, 0]);
  expect(week[5]).toMatchObject({ date: 12, isToday: true });
});

it("接下来：排除今天、逾期与待谈话，按截止时间再按优先级排序", () => {
  const space: V2Space = {
    ...emptyV2Space(),
    tasks: [
      makeTask({ id: "u-a", dueAt: "2026-09-15", type: "待收材料" }),
      makeTask({ id: "u-b", dueAt: "2026-09-14", type: "待联系", priority: "low" }),
      makeTask({ id: "u-c", dueAt: "2026-09-16", type: "待回访", priority: "high" }),
      makeTask({ id: "u-d", dueAt: "2026-09-14", type: "待复查", priority: "high" }),
      makeTask({ id: "u-talk", dueAt: "2026-09-20", type: "待谈话" }),
      makeTask({ id: "u-today", dueAt: "2026-09-12", type: "待联系" }),
      makeTask({ id: "u-late", dueAt: "2026-09-10", type: "待联系" }),
      makeTask({ id: "u-no-date", type: "待联系" }),
    ],
  };
  expect(upcomingTasks(space, "2026-09-12", 10).map((task) => task.id)).toEqual([
    "u-d",
    "u-b",
    "u-a",
    "u-c",
  ]);
  expect(upcomingTasks(space, "2026-09-12", 2).map((task) => task.id)).toEqual([
    "u-d",
    "u-b",
  ]);
});

it("接下来：超过 7 天窗口的事项不进入，避免与今天先做什么重复", () => {
  const space: V2Space = {
    ...emptyV2Space(),
    tasks: [
      makeTask({ id: "u-window-edge", dueAt: "2026-09-19", type: "待复查" }),
      makeTask({ id: "u-day-8", dueAt: "2026-09-20", type: "待复查" }),
      makeTask({ id: "u-two-weeks", dueAt: "2026-09-26", type: "待复查" }),
    ],
  };
  expect(upcomingTasks(space, "2026-09-12", 10).map((task) => task.id)).toEqual([
    "u-window-edge",
  ]);
});

it("没有待办时今日推进与本周节奏均为空", () => {
  const space = emptyV2Space();
  expect(todayProgress(space, "2026-09-12")).toEqual({
    done: 0,
    open: 0,
    total: 0,
  });
  expect(upcomingTasks(space, "2026-09-12")).toHaveLength(0);
  expect(weekRhythm(space, "2026-09-12").every((day) => day.count === 0)).toBe(
    true,
  );
});
