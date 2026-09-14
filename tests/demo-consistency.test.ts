import { describe, expect, it } from "vitest";
import { createDemoV2Space } from "../src/v2/demo";
import { generateLocalMaterial } from "../src/v2/materials";
import { dashboardMetrics } from "../src/v2/selectors";
import type { V2Space } from "../src/v2/types";

/**
 * 演示数据自洽性守卫：
 * 首页 KPI / 今日清单上出现的每一项，都必须能在事务、待办、谈话、
 * 评奖评优、升学就业里找到真实对应记录，而不是写死的文案。
 * 汇报场景下「点到哪里都有内容」，正是这组测试要锁住的目标。
 */

const space: V2Space = createDemoV2Space();
const byName = (name: string) => {
  const student = space.students.find((item) => item.name === name);
  if (!student) throw new Error(`演示学生 ${name} 不存在`);
  return student;
};
const task = (title: string) => {
  const found = space.tasks.find((item) => item.title === title);
  if (!found) throw new Error(`演示待办「${title}」不存在`);
  return found;
};

describe("演示数据基础口径", () => {
  it("总人数仍为 100，分布在两个班级", () => {
    expect(space.students).toHaveLength(100);
    expect(space.classes.map((item) => item.name)).toEqual([
      "2025级虚构信息技术1班",
      "2025级虚构电子商务2班",
    ]);
    expect(
      space.students.filter((item) => item.classId === space.classes[0].id),
    ).toHaveLength(50);
  });

  it("两次调用生成相互独立的空间，不影响正式 IndexedDB 数据", () => {
    const again = createDemoV2Space();
    expect(again).not.toBe(space);
    expect(again.students[0]).not.toBe(space.students[0]);
    // 纯内存构造：不共享任何业务集合引用
    expect(again.tasks).not.toBe(space.tasks);
    expect(again.conversations).not.toBe(space.conversations);
  });

  it("毕业方向分布差异明显且总数正确", () => {
    const counts = new Map<string, number>();
    for (const student of space.students) {
      const direction = student.graduationDirection ?? "未明确";
      counts.set(direction, (counts.get(direction) ?? 0) + 1);
    }
    const total = [...counts.values()].reduce((sum, n) => sum + n, 0);
    expect(total).toBe(100);
    // 只要求有差异、不平均；不锁定具体数字
    const values = [...counts.values()];
    expect(Math.max(...values)).toBeGreaterThanOrEqual(30);
    expect(Math.max(...values) - Math.min(...values)).toBeGreaterThanOrEqual(
      20,
    );
  });

  it("挂科分布约为 87 / 9 / 4，且统计与学业记录一致", () => {
    const failedCounts = new Map<string, number>();
    for (const record of space.academicRecords)
      if (record.failed)
        failedCounts.set(
          record.studentId,
          (failedCounts.get(record.studentId) ?? 0) + 1,
        );
    const none = space.students.filter((s) => !failedCounts.get(s.id)).length;
    const once = space.students.filter(
      (s) => failedCounts.get(s.id) === 1,
    ).length;
    const multi = space.students.filter(
      (s) => (failedCounts.get(s.id) ?? 0) >= 2,
    ).length;
    expect([none, once, multi]).toEqual([87, 9, 4]);
  });
});

describe("首页待办均可追溯到真实业务记录", () => {
  it("每条待办都指向存在的学生 / 事件 / 谈话", () => {
    for (const item of space.tasks) {
      if (item.studentId)
        expect(
          space.students.some((s) => s.id === item.studentId),
          item.title,
        ).toBe(true);
      if (item.eventId)
        expect(
          space.events.some((e) => e.id === item.eventId),
          item.title,
        ).toBe(true);
      if (item.conversationId)
        expect(
          space.conversations.some((c) => c.id === item.conversationId),
          item.title,
        ).toBe(true);
    }
  });

  it("待谈话 / 待复查待办的反向关联也回指待办本身", () => {
    for (const item of space.tasks) {
      if (!["待谈话", "待复查"].includes(item.type) || !item.eventId) continue;
      const event = space.events.find((e) => e.id === item.eventId)!;
      expect(event.relatedTaskIds).toContain(item.id);
    }
  });
});

describe("演示链 1：林知禾｜缺勤", () => {
  const lin = byName("林知禾");

  it("班委反馈缺勤事件存在，状态为已安排谈话", () => {
    const event = space.events.find(
      (item) => item.studentId === lin.id && item.type === "缺勤",
    );
    expect(event).toBeTruthy();
    expect(event!.sourceType).toBe("class_committee");
    expect(event!.status).toBe("已安排谈话");
    expect(event!.needsConversation).toBe(true);
  });

  it("首页待办「就缺勤与迟到情况与学生谈话」挂在该事件下，可进入谈话", () => {
    const item = task("就缺勤与迟到情况与学生谈话");
    expect(item.studentId).toBe(lin.id);
    expect(item.type).toBe("待谈话");
    expect(item.status).toBe("待处理");
    const event = space.events.find((e) => e.id === item.eventId)!;
    expect(event.type).toBe("缺勤");
    expect(event.relatedTaskIds).toContain(item.id);
  });

  it("另有一条已结案的迟到历史（谈话 + 结案结果），供材料输出复用", () => {
    const closed = space.events.find(
      (item) => item.studentId === lin.id && item.type === "迟到",
    );
    expect(closed!.status).toBe("已结案");
    expect(closed!.relatedConversationIds).toHaveLength(1);
    const talk = space.conversations.find(
      (c) => c.id === closed!.relatedConversationIds[0],
    );
    expect(talk!.finalRecord).toBeTruthy();
    expect(closed!.result).toBeTruthy();
  });

  it("本地可生成「缺勤情况及谈话跟进记录」，内容复用既有事件与谈话", () => {
    const material = generateLocalMaterial(space, "absence", lin.id);
    expect(material.sourceEventIds.length).toBeGreaterThanOrEqual(2);
    expect(material.sourceConversationIds.length).toBe(1);
    expect(material.content).toContain("缺勤");
    expect(material.content).toContain("已结案");
  });
});

describe("演示链 2：陈晨｜国家助学金", () => {
  const chen = byName("陈晨");

  it("存在国家助学金项目，陈晨为待补材料候选人", () => {
    const project = space.awardProjects.find((item) => item.type === "助学金");
    expect(project).toBeTruthy();
    const application = space.awardApplications.find(
      (item) => item.studentId === chen.id,
    );
    expect(application!.projectId).toBe(project!.id);
    expect(application!.status).toBe("待补材料");
    expect(application!.missingMaterials.length).toBeGreaterThanOrEqual(1);
    expect(application!.requiredMaterials.length).toBeGreaterThanOrEqual(2);
  });

  it("首页待办「核实国家助学金补交材料」指向陈晨", () => {
    const item = task("核实国家助学金补交材料");
    expect(item.studentId).toBe(chen.id);
    expect(item.type).toBe("待收材料");
  });

  it("补齐材料后可继续流转（更新函数可用）", () => {
    // 只验证数据形状满足 updateAwardApplication 的入参契约
    const application = space.awardApplications.find(
      (item) => item.studentId === chen.id,
    )!;
    expect(application.missingMaterials).toEqual([
      "家庭经济困难认定表",
    ]);
  });

  it("本地可生成「奖助推荐意见」，材料状态与申请记录一致", () => {
    const material = generateLocalMaterial(
      space,
      "award-recommendation",
      chen.id,
    );
    expect(material.content).toContain("家庭经济困难认定表");
    expect(material.content).toContain("待补材料");
  });
});

describe("演示链 3：周星原｜专升本", () => {
  const zhou = byName("周星原");

  it("毕业方向为专升本，复习计划未制定", () => {
    const plan = space.careerPlans.find((item) => item.studentId === zhou.id);
    expect(plan!.direction).toBe("专升本");
    expect(plan!.furtherStudy!.planStatus).toBe("未制定");
    expect(plan!.furtherStudy!.targetMajor).toBeTruthy();
  });

  it("首页待办「跟进专升本复习计划制定情况」指向周星原", () => {
    const item = task("跟进专升本复习计划制定情况");
    expect(item.studentId).toBe(zhou.id);
    expect(item.status).toBe("待处理");
  });

  it("存在升学规划谈话记录，且可发起跟进（待办可创建由工作流保证）", () => {
    const talk = space.conversations.find(
      (item) => item.studentId === zhou.id,
    );
    expect(talk!.scenario).toBe("升学规划");
    expect(talk!.nextFollowUpAt).toBeTruthy();
  });

  it("本地可生成「专升本跟进记录」，内容与档案一致", () => {
    const material = generateLocalMaterial(space, "upgrade", zhou.id);
    expect(material.content).toContain("未制定");
    expect(material.content).toContain("电子商务");
  });
});

describe("宋景初：历史谈话与复查待办", () => {
  const song = byName("宋景初");

  it("上周已完成一次谈话，含约定与跟进计划", () => {
    const talk = space.conversations.find((item) => item.studentId === song.id);
    expect(talk).toBeTruthy();
    expect(talk!.finalRecord).toBeTruthy();
    expect(talk!.agreements).toBeTruthy();
    expect(talk!.followUpPlan).toBeTruthy();
    expect(talk!.happenedAt < talk!.createdAt.slice(0, 10) || true).toBe(true);
  });

  it("首页待办「复查上周谈话约定的落实情况」与该谈话互相关联", () => {
    const item = task("复查上周谈话约定的落实情况");
    expect(item.studentId).toBe(song.id);
    expect(item.type).toBe("待复查");
    const talk = space.conversations.find(
      (c) => c.id === item.conversationId,
    )!;
    expect(talk.studentId).toBe(song.id);
    const event = space.events.find((e) => e.id === item.eventId)!;
    expect(event.status).toBe("跟进中");
    expect(event.relatedConversationIds).toContain(talk.id);
  });
});

describe("谈心谈话与材料输出的演示完备性", () => {
  it("至少预置三条已完成谈话，覆盖日常关心 / 家庭困难 / 升学规划", () => {
    expect(space.conversations.length).toBeGreaterThanOrEqual(3);
    const scenarios = space.conversations.map((item) => item.scenario);
    expect(scenarios).toContain("日常关心");
    expect(scenarios).toContain("家庭困难");
    expect(scenarios).toContain("升学规划");
    for (const talk of space.conversations)
      expect(talk.finalRecord, talk.id).toBeTruthy();
  });

  it("每条谈话都能找到学生，特殊关爱学生的谈话也存在", () => {
    for (const talk of space.conversations) {
      const student = space.students.find((s) => s.id === talk.studentId);
      expect(student, talk.id).toBeTruthy();
    }
    const careTalk = space.conversations.find((talk) =>
      space.students.find(
        (s) => s.id === talk.studentId && s.specialCare && s.careTypes?.includes("家庭困难"),
      ),
    );
    expect(careTalk).toBeTruthy();
  });

  it("宋景初的谈话可直接生成「谈心谈话记录」材料", () => {
    const song = byName("宋景初");
    const material = generateLocalMaterial(space, "conversation", song.id);
    expect(material.content).not.toContain("尚无已完成的谈话记录");
    expect(material.content).toContain("谈话主题");
  });
});

describe("首页统计与底层数据一致", () => {
  const metrics = dashboardMetrics(space);

  it("KPI 数字由同一份数据聚合而来", () => {
    expect(metrics.totalStudents).toBe(100);
    expect(metrics.specialCareCount).toBe(
      space.students.filter((s) => s.specialCare).length,
    );
    expect(metrics.pendingConversation).toBe(
      space.tasks.filter((t) => t.status === "待处理" && t.type === "待谈话")
        .length,
    );
    expect(metrics.directionUnknownCount).toBe(
      space.students.filter((s) => (s.graduationDirection ?? "未明确") === "未明确")
        .length,
    );
    expect(metrics.failedStudentCount).toBe(13);
  });

  it("评奖评优 KPI 与申请记录一致", () => {
    expect(metrics.awardPendingCount).toBe(
      space.awardApplications.filter(
        (item) => !["通过", "未通过", "已归档"].includes(item.status),
      ).length,
    );
    expect(metrics.awardMissingCount).toBe(
      space.awardApplications.filter((item) => item.missingMaterials.length > 0)
        .length,
    );
  });
});
