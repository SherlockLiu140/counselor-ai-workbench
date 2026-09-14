import { describe, expect, it } from "vitest";
import { demoStudents } from "../src/demo/data";
import { V2MemoryStore, importV1Students } from "../src/v2/store";
import {
  recordStandaloneConversation,
  type StandaloneConversationInput,
} from "../src/v2/workflow";

/**
 * 「发起一次谈心谈话」应当直接进入谈话，而不是先弹「登记一件事」。
 *
 * 这组用例锁住两点设计意图：
 * 1. 谈话可以脱离事件独立存在，且**默认不生成任何待办**——谈话当下已处理完，
 *    再排一条「待谈话」待办纯属自相矛盾；
 * 2. 需要归档到「事务」或安排复查，都必须由老师显式勾选，不做隐式副作用。
 *
 * 全部使用虚构数据。
 */
const STUDENT = demoStudents[0];

function draft(
  patch: Partial<StandaloneConversationInput> = {},
): StandaloneConversationInput {
  return {
    studentId: STUDENT.id,
    topic: "家庭困难",
    background: "",
    happenedAt: "2026-09-13",
    location: "办公室",
    rawNotes: "口述原始记录唯一串RAW。",
    studentExpression: "",
    counselorGuidance: "",
    agreements: "",
    followUpPlan: "",
    ...patch,
  };
}

async function freshStore() {
  const store = new V2MemoryStore();
  await importV1Students(store, [STUDENT]);
  return store;
}

describe("直接发起谈心谈话", () => {
  it("默认不生成任何待办，谈话记录可独立存在（无关联事件）", async () => {
    const store = await freshStore();
    const next = await recordStandaloneConversation(store, draft());

    expect(next.conversations).toHaveLength(1);
    expect(next.tasks).toHaveLength(0);
    expect(next.events).toHaveLength(0);

    const record = next.conversations[0];
    expect(record.eventId).toBeUndefined();
    expect(record.scenario).toBe("家庭困难");
    expect(record.rawNotes).toContain("RAW");
    expect(record.nextFollowUpAt).toBeUndefined();
    expect(record.aiUsed).toBe(false);
    expect(next.students.find((item) => item.id === STUDENT.id)?.status).toBe(
      "正常",
    );
  });

  it("关键回归点：绝不出现「待谈话」待办", async () => {
    const store = await freshStore();
    const next = await recordStandaloneConversation(store, draft());
    expect(next.tasks.some((task) => task.type === "待谈话")).toBe(false);
  });

  it("显式勾选留痕时，才在「事务」建一条事件；没排复查就直接结案且不挂待办", async () => {
    const store = await freshStore();
    const next = await recordStandaloneConversation(
      store,
      draft({ archiveEvent: true }),
    );

    expect(next.events).toHaveLength(1);
    const event = next.events[0];
    // 谈完就了结：不留「确认结案」的仪式感点击
    expect(event.status).toBe("已结案");
    expect(event.closedAt).toBeTruthy();
    expect(event.needsConversation).toBe(false);
    expect(event.needsFollowUp).toBe(false);
    expect(event.relatedTaskIds).toEqual([]);
    expect(event.relatedConversationIds).toEqual([next.conversations[0].id]);
    expect(next.conversations[0].eventId).toBe(event.id);
    // 归档是留痕，不是排活
    expect(next.tasks).toHaveLength(0);
  });

  it("只有显式勾选复查提醒时才生成一条待复查待办，并写入关联事件", async () => {
    const store = await freshStore();
    const next = await recordStandaloneConversation(
      store,
      draft({
        archiveEvent: true,
        needsFollowUpTask: true,
        nextFollowUpAt: "2026-09-20",
      }),
    );

    expect(next.tasks).toHaveLength(1);
    expect(next.tasks[0]).toMatchObject({
      type: "待复查",
      dueAt: "2026-09-20",
      status: "待处理",
    });
    expect(next.tasks[0].conversationId).toBe(next.conversations[0].id);
    expect(next.tasks[0].eventId).toBe(next.events[0].id);
    expect(next.events[0].relatedTaskIds).toEqual([next.tasks[0].id]);
    // 排了复查就不该结案，交给既有链路在复查完成后收口
    expect(next.events[0].status).toBe("跟进中");
    expect(next.events[0].closedAt).toBeUndefined();
    expect(next.conversations[0].nextFollowUpAt).toBe("2026-09-20");
    expect(next.students.find((item) => item.id === STUDENT.id)?.status).toBe(
      "跟进中",
    );
  });

  it("勾了复查提醒但没给日期时不建待办，避免出现无截止时间的空待办", async () => {
    const store = await freshStore();
    const next = await recordStandaloneConversation(
      store,
      draft({ needsFollowUpTask: true, nextFollowUpAt: undefined }),
    );
    expect(next.tasks).toHaveLength(0);
    expect(next.conversations[0].nextFollowUpAt).toBeUndefined();
  });

  it("背景留空时按主题生成中性说明，不臆造事实", async () => {
    const store = await freshStore();
    const next = await recordStandaloneConversation(
      store,
      draft({ topic: "人际矛盾" }),
    );
    const record = next.conversations[0];
    expect(record.finalRecord).toContain("谈话主题：人际矛盾");
    expect(record.finalRecord).toContain("本次谈话围绕“人际矛盾”展开。");
    // 留空的口述之外的段落走模板兜底，不编造具体情节
    expect(record.finalRecord).toContain("待进一步确认。");
  });

  it("学生不存在时报错，且不写入任何数据", async () => {
    const store = await freshStore();
    await expect(
      recordStandaloneConversation(store, draft({ studentId: "student:不存在" })),
    ).rejects.toThrow();
    const after = await store.read();
    expect(after.conversations).toHaveLength(0);
    expect(after.events).toHaveLength(0);
    expect(after.tasks).toHaveLength(0);
  });
});
