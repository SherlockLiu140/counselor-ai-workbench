import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { demoStudents } from "../src/demo/data";
import { guessFields, parseRoster, rosterFields } from "../src/storage/roster";
import { IndexedStore, importStudents } from "../src/storage/store";
import { dashboardMetrics, filterStudents } from "../src/v2/selectors";
import {
  buildMinimumTalkSource,
  buildAcademicTalkSource,
  restoreLocalIdentity,
} from "../src/v2/PrivacyGateway";
import {
  V2IndexedStore,
  V2MemoryStore,
  importV1Students,
  migrateV1Space,
  registerEvent,
} from "../src/v2/store";
import {
  closeEvent,
  completeEventConversation,
  completeTask,
} from "../src/v2/workflow";

describe("workbench data model and local workflow", () => {
  it("imports 100 expanded roster rows by header and keeps special-care fields independent", async () => {
    const headers = Object.values(rosterFields);
    const rows = [headers];
    for (let index = 0; index < 100; index++) {
      const values: Record<string, string> = {
        name: `虚构学生${index + 1}`,
        studentId: `ZY${String(index + 1).padStart(4, "0")}`,
        className: "66中药6班",
        phone: `139${String(index + 1).padStart(8, "0")}`,
        identity: `11010120000101${String(index).padStart(4, "0")}`,
        address: `虚构地址${index + 1}号`, dorm: `6栋${index + 1}室`,
        workStatus: index % 5 === 0 ? "待关注" : "正常",
        specialCare: index % 4 === 0 ? "是" : "否",
        careTypes: index === 0 ? "家庭困难、学业困难" : index % 4 === 0 ? "心理状态关注" : "",
        religion: "虚构信教情况", psychologicalNotes: "虚构心理记录",
        familySituation: "虚构家庭情况", sexualOrientation: "虚构性取向",
        currentRole: index === 0 ? "班长" : "", formerRoles: "学习委员",
        previousAverage: "82", latestAverage: "76", previousRank: "12", latestRank: "20",
        rankChange: "下降8名", failedCount: index % 4 === 0 ? "2" : "0",
        graduationDirection: "专升本", lastTalkDate: "2026-09-01", importedTaskCount: "3",
        email: "", emergencyName: "", emergencyPhone: "",
      };
      rows.push(Object.keys(rosterFields).map((key) => values[key] ?? ""));
    }
    const parsed = parseRoster(rows, guessFields(headers));
    const store = new V2MemoryStore();
    const state = await importV1Students(store, parsed);
    expect(state.students).toHaveLength(100);
    expect(state.classes[0].name).toBe("66中药6班");
    expect(dashboardMetrics(state).specialCareCount).toBe(25);
    expect(state.students[0].careTypes).toEqual(["家庭困难", "学业困难"]);
    expect(state.students[1].specialCare).toBe(false);
    expect(state.sensitiveProfiles[0]).toMatchObject({
      identity: expect.stringContaining("110101"), religion: "虚构信教情况",
      sexualOrientation: "虚构性取向", psychologicalNotes: "虚构心理记录",
    });
    expect(state.academicRecords.filter((item) => item.studentId === state.students[0].id)).toHaveLength(2);
    expect(state.academicRecords.at(-1)).toMatchObject({ score: 76, rank: 20 });
    const aiSource = buildAcademicTalkSource(state, state.students[0]);
    expect(aiSource).toContain("上次平均成绩82、班级排名12 → 最近平均成绩76、班级排名20");
    expect(aiSource).not.toContain("虚构信教情况");
    expect(aiSource).not.toContain("虚构性取向");
    expect(aiSource).not.toContain("110101");
    expect(aiSource).not.toContain("13900000001");
  });

  it("migrates the legacy roster into classes without losing complete local fields", () => {
    const migrated = migrateV1Space(
      { students: demoStudents.slice(0, 16) },
      "2026-09-10T00:00:00.000Z",
    );
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.classes).toHaveLength(2);
    expect(migrated.students).toHaveLength(16);
    expect(migrated.students[0]).toMatchObject({
      id: demoStudents[0].id,
      studentNo: demoStudents[0].studentId,
      name: demoStudents[0].name,
      phone: demoStudents[0].phone,
      status: "正常",
    });
  });

  it("keeps the legacy snapshot before the first persistent migration", async () => {
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase("counselor-workbench-v1");
      request.onsuccess = () => resolve();
    });
    const v1 = await IndexedStore.open();
    await importStudents(v1, demoStudents.slice(0, 3));
    v1.close();
    const v2 = await V2IndexedStore.open();
    expect((await v2.read()).students).toHaveLength(3);
    v2.close();
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("counselor-workbench-v1");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const backup = await new Promise<{ data: { students: unknown[] } }>(
      (resolve, reject) => {
        const tx = db.transaction("backups", "readonly");
        const request = tx.objectStore("backups").get("v1-before-v2");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      },
    );
    expect(backup.data.students).toHaveLength(3);
    db.close();
  });

  it("runs absence registration, talk, follow-up and closure as one traceable chain", async () => {
    const store = new V2MemoryStore();
    await importV1Students(store, demoStudents.slice(0, 1));
    let state = await registerEvent(store, {
      studentId: demoStudents[0].id,
      type: "缺勤",
      occurredAt: "2026-09-10",
      sourceType: "class_committee",
      sourceText: "虚构学习委员反馈",
      facts: "第一、二节课未到，原因待核实。",
      priority: "medium",
      needsConversation: true,
      needsFollowUp: true,
    });
    const event = state.events[0];
    expect(event.status).toBe("待处理");
    expect(state.tasks[0]).toMatchObject({ type: "待谈话", eventId: event.id });

    state = await completeEventConversation(store, {
      eventId: event.id,
      happenedAt: "2026-09-10",
      rawNotes: "学生说明已知悉课程安排。",
      studentExpression: "说明了当天情况。",
      counselorGuidance: "共同核对课程安排。",
      agreements: "按时到课。",
      followUpPlan: "一周后复查考勤。",
      nextFollowUpAt: "2026-09-17",
    });
    expect(state.conversations).toHaveLength(1);
    expect(state.conversations[0].aiUsed).toBe(false);
    expect(state.tasks.find((task) => task.type === "待谈话")?.status).toBe(
      "已完成",
    );
    const followUp = state.tasks.find((task) => task.type === "待复查")!;
    expect(followUp.eventId).toBe(event.id);
    expect(state.events[0].status).toBe("跟进中");

    state = await completeTask(store, followUp.id, "复查无新增缺勤。 ");
    expect(state.events[0].status).toBe("已完成");
    state = await closeEvent(store, event.id, "已完成谈话与复查。 ");
    expect(state.events[0]).toMatchObject({
      status: "已结案",
      result: "已完成谈话与复查。 ",
    });
  });

  it("supports class, status and search filters for 100-person rosters", async () => {
    const store = new V2MemoryStore();
    const hundred = Array.from({ length: 100 }, (_, index) => ({
      ...demoStudents[index % demoStudents.length],
      id: `student:v2-${index}`,
      studentId: `WB${String(index).padStart(4, "0")}`,
      className: index < 50 ? "虚构1班" : "虚构2班",
    }));
    const state = await importV1Students(store, hundred);
    expect(state.students).toHaveLength(100);
    const secondClass = state.classes.find((item) => item.name === "虚构2班")!;
    expect(
      filterStudents(state.students, { classId: secondClass.id }),
    ).toHaveLength(50);
    expect(filterStudents(state.students, { query: "WB0099" })).toHaveLength(1);
    expect(dashboardMetrics(state).totalStudents).toBe(100);
  });

  it("does not put local sensitive profiles into event or task records", async () => {
    const store = new V2MemoryStore();
    await importV1Students(store, [
      { ...demoStudents[0], identity: "110101199001010000" },
    ]);
    const state = await registerEvent(store, {
      studentId: demoStudents[0].id,
      type: "学业",
      occurredAt: "2026-09-10",
      sourceType: "teacher",
      facts: "虚构课程成绩需要核实。",
      priority: "low",
      needsConversation: false,
      needsFollowUp: true,
    });
    expect(
      JSON.stringify({ events: state.events, tasks: state.tasks }),
    ).not.toContain("110101");
  });

  it("keeps stable privacy codes and excludes unrelated sensitive profile fields", async () => {
    const store = new V2MemoryStore();
    let state = await importV1Students(store, demoStudents.slice(0, 2));
    const originalCodes = { ...state.privacyCodes };
    state = await importV1Students(
      store,
      [...demoStudents.slice(0, 2)].reverse(),
    );
    expect(state.privacyCodes).toEqual(originalCodes);
    state.sensitiveProfiles.push({
      studentId: demoStudents[0].id,
      religion: "虚构宗教信息",
      sexualOrientation: "虚构性取向信息",
      medicalNotes: "虚构医疗信息",
      customFields: [],
    });
    const source = buildMinimumTalkSource(state, state.students[0]);
    expect(source).not.toContain("虚构宗教信息");
    expect(source).not.toContain("虚构性取向信息");
    expect(source).not.toContain("虚构医疗信息");
    expect(source).not.toContain(state.students[0].phone);
    expect(
      restoreLocalIdentity(
        `记录对象：${originalCodes[state.students[0].id]}`,
        state,
      ),
    ).toContain(state.students[0].name);
    expect(state.conversationTemplates.length).toBeGreaterThanOrEqual(14);
  });
});
