import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import {
  MemoryStore,
  IndexedStore,
  importStudents,
  ensureCodes,
  clearAll,
  clearMappings,
} from "../src/storage/store";
import { guessFields, parseRoster } from "../src/storage/roster";
import { demoStudents, demoRosterRows } from "../src/demo/data";
describe("mapping and roster", () => {
  it("assigns S003 to the fictional Chen Chen", async () => {
    const s = new MemoryStore();
    expect(
      (await importStudents(s, demoStudents)).codes[demoStudents[2].id],
    ).toBe("S003");
  });
  it("is stable across documents and reordered imports", async () => {
    const s = new MemoryStore();
    const a = await importStudents(s, demoStudents);
    const b = await importStudents(s, [...demoStudents].reverse());
    expect(b.codes).toEqual(a.codes);
    expect((await ensureCodes(s)).codes).toEqual(a.codes);
  });
  it("supports more than 26 mappings", async () => {
    const s = new MemoryStore();
    expect(
      Object.values((await importStudents(s, demoStudents)).codes),
    ).toContain("S030");
  });
  it("clears mappings and never reuses an old number", async () => {
    const s = new MemoryStore();
    await importStudents(s, demoStudents);
    expect((await clearMappings(s)).codes).toEqual({});
    expect((await ensureCodes(s)).codes[demoStudents[0].id]).toBe("S031");
  });
  it("clears roster and mapping together", async () => {
    const s = new MemoryStore();
    await importStudents(s, demoStudents);
    const result = await clearAll(s);
    expect(result.students).toEqual([]);
    expect(result.codes).toEqual({});
  });
  it("session storage disappears on closing", async () => {
    const s = new MemoryStore();
    await importStudents(s, demoStudents);
    s.close();
    expect((await s.read()).students).toEqual([]);
  });
  it("session and demo stores are isolated", async () => {
    const real = new MemoryStore(),
      demo = new MemoryStore();
    await importStudents(real, demoStudents.slice(0, 1));
    expect((await demo.read()).students).toEqual([]);
  });
  it("persists across reopen and serializes concurrent tabs", async () => {
    const a = await IndexedStore.open();
    await clearAll(a);
    const b = await IndexedStore.open();
    await Promise.all([
      importStudents(a, demoStudents.slice(0, 15)),
      importStudents(b, demoStudents.slice(15)),
    ]);
    a.close();
    b.close();
    const c = await IndexedStore.open();
    const state = await c.read();
    expect(state.students).toHaveLength(30);
    expect(new Set(Object.values(state.codes)).size).toBe(30);
    c.close();
  });
  it("rejects a conflicting student identity atomically", async () => {
    const s = new MemoryStore();
    await importStudents(s, [demoStudents[0]]);
    await expect(
      importStudents(s, [
        demoStudents[1],
        { ...demoStudents[0], name: "虚构冲突姓名" },
      ]),
    ).rejects.toThrow();
    expect((await s.read()).students).toHaveLength(1);
  });
  it("imports mapped roster fields", () =>
    expect(
      parseRoster(demoRosterRows, guessFields(demoRosterRows[0])),
    ).toHaveLength(30));
  it("rejects missing student id field", () =>
    expect(() =>
      parseRoster(demoRosterRows, {
        ...guessFields(demoRosterRows[0]),
        studentId: -1,
      }),
    ).toThrow());
  it("rejects duplicate student numbers", () =>
    expect(() =>
      parseRoster(
        [demoRosterRows[0], demoRosterRows[1], demoRosterRows[1]],
        guessFields(demoRosterRows[0]),
      ),
    ).toThrow("重复"));
  it("allows same-name students with separate ids", () => {
    const rows = [
      ["姓名", "学号"],
      ["陈晨", "20260003"],
      ["陈晨", "20269999"],
    ];
    expect(parseRoster(rows, guessFields(rows[0]))[0].id).not.toBe(
      parseRoster(rows, guessFields(rows[0]))[1].id,
    );
  });
  it("rejects assigning one column to two fields", () =>
    expect(() =>
      parseRoster(demoRosterRows, {
        ...guessFields(demoRosterRows[0]),
        studentId: 0,
      }),
    ).toThrow("多个"));
});
