import type { Student } from "../engine/types";

export interface Space {
  students: Student[];
  codes: Record<string, string>;
  nextCode: number;
  revision: number;
}
export const emptySpace = (): Space => ({
  students: [],
  codes: {},
  nextCode: 1,
  revision: 0,
});
export interface LocalStore {
  read(): Promise<Space>;
  update(fn: (state: Space) => void): Promise<Space>;
  close(): void;
}

export class MemoryStore implements LocalStore {
  private state = emptySpace();
  async read() {
    return structuredClone(this.state);
  }
  async update(fn: (state: Space) => void) {
    const next = structuredClone(this.state);
    fn(next);
    next.revision++;
    this.state = next;
    return this.read();
  }
  close() {
    this.state = emptySpace();
  }
}

// A single read/write transaction serializes updates across tabs; no read-then-write race.
export class IndexedStore implements LocalStore {
  private constructor(private db: IDBDatabase) {}
  static open(): Promise<IndexedStore> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("counselor-workbench-v1", 2);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("space"))
          db.createObjectStore("space");
        if (!db.objectStoreNames.contains("v2-space"))
          db.createObjectStore("v2-space");
        if (!db.objectStoreNames.contains("backups"))
          db.createObjectStore("backups");
      };
      request.onerror = () =>
        reject(new Error("无法打开本地存储，请使用仅本次会话模式。"));
      request.onblocked = () =>
        reject(new Error("本地存储被其他窗口占用，请关闭旧窗口后重试。"));
      request.onsuccess = () => {
        request.result.onversionchange = () => request.result.close();
        resolve(new IndexedStore(request.result));
      };
    });
  }
  read(): Promise<Space> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction("space", "readonly");
      const request = tx.objectStore("space").get("active");
      tx.oncomplete = () => resolve(request.result ?? emptySpace());
      tx.onerror = () => reject(new Error("读取本地数据失败。"));
    });
  }
  update(fn: (state: Space) => void): Promise<Space> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction("space", "readwrite");
      const table = tx.objectStore("space");
      const request = table.get("active");
      let next: Space;
      request.onsuccess = () => {
        try {
          next = request.result ?? emptySpace();
          fn(next);
          next.revision++;
          table.put(next, "active");
        } catch (error) {
          tx.abort();
          reject(error);
        }
      };
      tx.oncomplete = () => resolve(structuredClone(next));
      tx.onabort = tx.onerror = () =>
        reject(new Error("本地保存失败，操作未完成。"));
    });
  }
  close() {
    this.db.close();
  }
}

export async function importStudents(store: LocalStore, students: Student[]) {
  return store.update((state) => {
    for (const student of students) {
      const index = state.students.findIndex(
        (existing) => existing.id === student.id,
      );
      if (index >= 0 && state.students[index].name !== student.name)
        throw new Error("相同学号对应不同姓名，请先核实。");
      if (index >= 0) state.students[index] = student;
      else state.students.push(student);
      if (!state.codes[student.id])
        state.codes[student.id] =
          `S${String(state.nextCode++).padStart(3, "0")}`;
    }
  });
}
export async function ensureCodes(store: LocalStore) {
  return store.update((state) => {
    for (const student of state.students)
      if (!state.codes[student.id])
        state.codes[student.id] =
          `S${String(state.nextCode++).padStart(3, "0")}`;
  });
}
export async function clearMappings(store: LocalStore) {
  return store.update((state) => {
    state.codes = {}; /* Never reuse old numbers after clearing. */
  });
}
export async function clearAll(store: LocalStore) {
  return store.update((state) => {
    state.students = [];
    state.codes = {};
  });
}
