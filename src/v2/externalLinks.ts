import { useSyncExternalStore } from "react";

/**
 * 学工系统的入口地址。
 *
 * 学校不同，地址不同，所以只保存在本机、由班主任填一次。
 * 独立存储键：不进 V2Space，因此不触发数据迁移；也不进本地备份，
 * 因为它只是「学校系统的地址」，不是学生数据。
 */

export const STUDENT_SYSTEM_STORAGE_KEY = "counselor-student-system-url";

/**
 * 未设置时的默认入口，留空表示「由班主任自己填」。
 *
 * 刻意不做预设：不同学校的学工系统地址不同，写死一个别人的地址，
 * 既没有意义，也会让新用户在界面上看到一个打不开的链接。
 * 真要做统一部署（同一个学校批量分发），改这一个常量即可。
 */
export const DEFAULT_STUDENT_SYSTEM_URL = "";

/** 只接受 http / https，去掉首尾空格；缺协议时补 https。 */
export function normalizeStudentSystemUrl(input: string): string {
  const raw = input.trim();
  if (!raw) return "";
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error(
      "网址无法识别，请填完整地址，例如 https://xg.example.edu.cn。",
    );
  }
  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new Error("只支持 http / https 地址，其他协议不允许打开。");
  return url.toString();
}

/** 展示用的短地址：去掉协议与结尾斜杠，侧边栏一行放得下。 */
export function shortStudentSystemUrl(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

let cached: string | null = null;
const listeners = new Set<() => void>();

function read(): string {
  if (typeof window === "undefined") return DEFAULT_STUDENT_SYSTEM_URL;
  try {
    return (
      window.localStorage.getItem(STUDENT_SYSTEM_STORAGE_KEY)?.trim() ||
      DEFAULT_STUDENT_SYSTEM_URL
    );
  } catch {
    /* 隐私模式下 localStorage 可能不可用，降级为默认值。 */
    return DEFAULT_STUDENT_SYSTEM_URL;
  }
}

export function getStudentSystemUrl(): string {
  if (cached === null) cached = read();
  return cached;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 保存并通知所有用到它的地方（侧边栏、谈话记录、待办）。 */
export function saveStudentSystemUrl(input: string): string {
  const url = normalizeStudentSystemUrl(input);
  cached = url;
  try {
    if (typeof window !== "undefined") {
      if (url) window.localStorage.setItem(STUDENT_SYSTEM_STORAGE_KEY, url);
      else window.localStorage.removeItem(STUDENT_SYSTEM_STORAGE_KEY);
    }
  } catch {
    /* 存储不可用时仅本次会话内有效。 */
  }
  listeners.forEach((listener) => listener());
  return url;
}

export function useStudentSystemUrl(): string {
  return useSyncExternalStore(subscribe, getStudentSystemUrl, getStudentSystemUrl);
}
