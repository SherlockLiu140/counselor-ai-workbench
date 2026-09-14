import { describe, expect, it } from "vitest";
import { demoStudents } from "../src/demo/data";
import {
  V2MemoryStore,
  importV1Students,
  migrateV1Space,
  registerEvent,
} from "../src/v2/store";
import { completeEventConversation, saveGatewayResult } from "../src/v2/workflow";
import {
  conversationToMarkdown,
  conversationsToMarkdown,
  exportConversations,
  sortConversations,
  studentNameOf,
} from "../src/v2/export";
import type { ConversationRecord, V2Space } from "../src/v2/types";

/** 这些用例全部使用虚构数据，不涉及真实学生资料。 */
const STUDENT = demoStudents[0];

/** 造一个最小可用的谈话记录，字段全部带唯一标记便于断言。 */
function makeConversation(
  patch: Partial<ConversationRecord> = {},
): ConversationRecord {
  return {
    id: "conversation:test-1",
    studentId: STUDENT.id,
    eventId: "event:test-1",
    scenario: "缺勤",
    happenedAt: "2026-09-13",
    location: "办公室",
    rawNotes: "口述原始记录标记RAW",
    finalRecord: "标准记录标记FINAL",
    studentExpression: "学生主要表达标记EXPR",
    counselorGuidance: "班主任引导标记GUIDE",
    agreements: "共识措施标记AGREE",
    followUpPlan: "后续跟进标记FOLLOW",
    nextFollowUpAt: "2026-09-20",
    aiUsed: false,
    createdAt: "2026-09-13T10:00:00.000Z",
    ...patch,
  };
}

/** 用真实的迁移函数搭一个最小 V2Space，避免手写半个对象导致类型漂移。 */
function makeSpace(conversations: ConversationRecord[]): V2Space {
  const space = migrateV1Space(
    { students: [STUDENT] },
    "2026-09-01T00:00:00.000Z",
  );
  space.conversations = conversations;
  space.events = [
    {
      id: "event:test-1",
      studentId: STUDENT.id,
      type: "缺勤",
      occurredAt: "2026-09-10",
      sourceType: "class_committee",
      sourceText: "虚构来源",
      facts: "事实标记FACTS",
      priority: "medium",
      status: "跟进中",
      needsConversation: true,
      needsFollowUp: false,
      relatedConversationIds: [],
      relatedTaskIds: [],
      createdAt: "2026-09-10T00:00:00.000Z",
    },
  ];
  return space;
}

describe("谈话记录导出", () => {
  it("按谈话日期倒序，同日按写入时间倒序", () => {
    const sorted = sortConversations([
      makeConversation({ id: "c-old", happenedAt: "2026-09-01" }),
      makeConversation({ id: "c-new", happenedAt: "2026-09-20" }),
      makeConversation({
        id: "c-tie-late",
        happenedAt: "2026-09-13",
        createdAt: "2026-09-13T18:00:00.000Z",
      }),
      makeConversation({
        id: "c-tie-early",
        happenedAt: "2026-09-13",
        createdAt: "2026-09-13T08:00:00.000Z",
      }),
    ]);
    expect(sorted.map((item) => item.id)).toEqual([
      "c-new",
      "c-tie-late",
      "c-tie-early",
      "c-old",
    ]);
  });

  it("单条导出包含老师实际录入的每一个字段，含只填口述记录的情况", () => {
    const space = makeSpace([makeConversation()]);
    const text = conversationToMarkdown(makeConversation(), space);
    for (const marker of [
      "RAW",
      "FINAL",
      "EXPR",
      "GUIDE",
      "AGREE",
      "FOLLOW",
      "2026-09-20",
      "办公室",
    ])
      expect(text).toContain(marker);
    expect(text).toContain("本地模板成文");
  });

  it("只填口述原始记录时，导出仍能还原原文（卡片与成文都优先学生表达，故导出必须单独列出）", () => {
    const space = makeSpace([
      makeConversation({ studentExpression: "", counselorGuidance: "" }),
    ]);
    const text = conversationToMarkdown(
      makeConversation({ studentExpression: "", counselorGuidance: "" }),
      space,
    );
    expect(text).toContain("口述原始记录");
    expect(text).toContain("RAW");
  });

  it("AI 成文的记录会标注成文方式，避免与本地模板混淆", () => {
    const space = makeSpace([makeConversation({ aiUsed: true })]);
    expect(conversationToMarkdown(makeConversation({ aiUsed: true }), space)).toContain(
      "AI 辅助成文",
    );
  });

  it("多条导出带标题、条数与免责提示；空列表给出占位文案", () => {
    const items = [
      makeConversation({ id: "c-1" }),
      makeConversation({ id: "c-2", happenedAt: "2026-09-14" }),
    ];
    const text = conversationsToMarkdown(items, makeSpace(items), {
      title: "全班 · 谈心谈话记录",
      day: "2026-09-13",
    });
    expect(text).toContain("# 全班 · 谈心谈话记录");
    expect(text).toContain("共 2 条");
    expect(text).toContain("请妥善保管");

    expect(
      conversationsToMarkdown([], makeSpace([]), {
        title: "空列表",
        day: "2026-09-13",
      }),
    ).toContain("暂无谈话记录");
  });

  it("没有记录时不产生文件（返回 0，且不触碰 DOM）", async () => {
    expect(
      await exportConversations([], makeSpace([]), {
        title: "空",
        fileBase: "空",
        day: "2026-09-13",
      }),
    ).toEqual({ count: 0 });
  });

  it("导出文件名含学生与日期，内容为对应记录", async () => {
    type FakeAnchor = { download?: string; clicked?: boolean; click: () => void };
    const anchors: FakeAnchor[] = [];
    const blobs: string[] = [];
    const g = globalThis as unknown as Record<string, unknown>;
    const originalBlob = g.Blob;
    const originalUrl = g.URL;
    const originalDocument = g.document;
    g.Blob = class {
      constructor(parts: string[]) {
        blobs.push(parts.join(""));
      }
    };
    g.URL = { createObjectURL: () => "blob:fake", revokeObjectURL: () => {} };
    g.document = {
      createElement: () => {
        const anchor: FakeAnchor = {
          click() {
            anchor.clicked = true;
            anchors.push(anchor);
          },
        };
        return anchor;
      },
    };
    try {
      const items = [makeConversation()];
      const { count, path } = await exportConversations(
        items,
        makeSpace(items),
        {
          title: `${STUDENT.name} · 谈心谈话记录`,
          fileBase: `${STUDENT.name}-谈话记录`,
          day: "2026-09-13",
        },
      );
      expect(count).toBe(1);
      expect(path).toBeUndefined();
      expect(anchors).toHaveLength(1);
      expect(anchors[0].download).toBe(
        `${STUDENT.name}-谈话记录-2026-09-13.md`,
      );
      expect(anchors[0].clicked).toBe(true);
      expect(blobs[0]).toContain("RAW");
    } finally {
      g.Blob = originalBlob;
      g.URL = originalUrl;
      g.document = originalDocument;
    }
  });

  it("学生名缺失时回退为占位，不抛错", () => {
    expect(studentNameOf(makeSpace([]), "student:不存在")).toBe("未知学生");
    expect(studentNameOf(makeSpace([]), undefined)).toBe("未知学生");
  });
});

describe("AI 结果写回指定的谈话记录", () => {
  it("按 conversationId 精确写回，不会覆盖该生最新一条", async () => {
    const store = new V2MemoryStore();
    await importV1Students(store, [STUDENT]);

    let state = await registerEvent(store, {
      studentId: STUDENT.id,
      type: "缺勤",
      occurredAt: "2026-09-10",
      sourceType: "class_committee",
      sourceText: "虚构来源一",
      facts: "第一次事件事实。",
      priority: "medium",
      needsConversation: true,
      needsFollowUp: false,
    });
    const firstEvent = state.events[0].id;
    state = await registerEvent(store, {
      studentId: STUDENT.id,
      type: "迟到",
      occurredAt: "2026-09-12",
      sourceType: "class_committee",
      sourceText: "虚构来源二",
      facts: "第二次事件事实。",
      priority: "medium",
      needsConversation: true,
      needsFollowUp: false,
    });
    const secondEvent = state.events.find((item) => item.id !== firstEvent)!.id;

    for (const eventId of [firstEvent, secondEvent])
      state = await completeEventConversation(store, {
        eventId,
        happenedAt: "2026-09-13",
        rawNotes: `原始记录 ${eventId}`,
        studentExpression: "",
        counselorGuidance: "",
        agreements: "",
        followUpPlan: "",
      });

    expect(state.conversations).toHaveLength(2);
    const target = state.conversations[0];
    const latest = state.conversations[1];
    expect(target.finalRecord).toContain(firstEvent);
    expect(latest.finalRecord).toContain(secondEvent);

    const next = await saveGatewayResult(
      store,
      STUDENT.id,
      "AI 整理后的文本标记",
      target.id,
    );

    expect(next.conversations.find((item) => item.id === target.id)).toMatchObject({
      finalRecord: "AI 整理后的文本标记",
      aiUsed: true,
    });
    // 关键回归点：最新那条不能被牵连覆盖
    expect(next.conversations.find((item) => item.id === latest.id)).toMatchObject({
      aiUsed: false,
    });
    expect(
      next.conversations.find((item) => item.id === latest.id)!.finalRecord,
    ).toContain(secondEvent);
  });

  it("指定的谈话不存在时报错，不误写到别人的记录上", async () => {
    const store = new V2MemoryStore();
    await importV1Students(store, [STUDENT]);
    let state = await registerEvent(store, {
      studentId: STUDENT.id,
      type: "缺勤",
      occurredAt: "2026-09-10",
      sourceType: "class_committee",
      sourceText: "虚构来源",
      facts: "事件事实。",
      priority: "medium",
      needsConversation: true,
      needsFollowUp: false,
    });
    state = await completeEventConversation(store, {
      eventId: state.events[0].id,
      happenedAt: "2026-09-13",
      rawNotes: "原始记录。",
      studentExpression: "",
      counselorGuidance: "",
      agreements: "",
      followUpPlan: "",
    });
    expect(state.conversations).toHaveLength(1);

    await expect(
      saveGatewayResult(store, STUDENT.id, "不该写入", "conversation:不存在"),
    ).rejects.toThrow();
    const after = await store.read();
    expect(after.conversations[0].aiUsed).toBe(false);
    expect(after.conversations[0].finalRecord).not.toContain("不该写入");
  });
});
