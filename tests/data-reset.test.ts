import { beforeEach, describe, expect, it } from "vitest";
import type { V1Student } from "../src/engine/types";
import {
  V2MemoryStore,
  importV1Students,
  registerEvent,
  resetV2Space,
} from "../src/v2/store";

const student: V1Student = {
  id: "student:20260001",
  studentId: "20260001",
  name: "张三",
  className: "2025级软件技术1班",
};

describe("resetV2Space（恢复出厂）", () => {
  let store: V2MemoryStore;

  beforeEach(async () => {
    store = new V2MemoryStore();
    await importV1Students(store, [student]);
    await registerEvent(store, {
      studentId: "student:20260001",
      type: "缺勤",
      occurredAt: "2026-09-14",
      sourceType: "teacher",
      detail: "上午未到校",
      needsConversation: false,
      needsFollowUp: false,
      priority: "medium",
    });
  });

  it("清空全部业务数据，只保留默认模板与空结构", async () => {
    const after = await resetV2Space(store);
    expect(after.students).toHaveLength(0);
    expect(after.classes).toHaveLength(0);
    expect(after.events).toHaveLength(0);
    expect(after.tasks).toHaveLength(0);
    expect(after.conversations).toHaveLength(0);
    expect(after.privacyCodes).toEqual({});
    expect(after.nextPrivacyCode).toBe(1);
    // 默认谈话模板必须被还原，不能变成空。
    expect(after.conversationTemplates.length).toBeGreaterThan(0);
    expect(
      after.conversationTemplates.some((t) => t.id === "conversation-absence"),
    ).toBe(true);
  });

  it("清除后可重新导入同一批学生（学号不冲突）", async () => {
    await resetV2Space(store);
    const again = await importV1Students(store, [student]);
    expect(again.students).toHaveLength(1);
    expect(again.students[0].name).toBe("张三");
  });
});
