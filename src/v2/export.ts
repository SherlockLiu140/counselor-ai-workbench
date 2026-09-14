import { saveExportFile } from "./desktop";
import type { ConversationRecord, V2Space } from "./types";

/**
 * 谈话记录的本地导出。
 *
 * 边界（与 AGENTS.md 一致）：
 * - 不经过任何后端、不上传、不联网；桌面端写入本机「下载」目录。
 * - 导出内容含学生真实姓名与谈话原文，属于「本地完整资料」，只落在老师自己的磁盘上。
 * - 文件名里的日期由调用方传入（沿用工作台既有的日期口径），本模块不自造时间逻辑。
 */

/** 文件名安全化：去掉路径与通配保留字符，避免不同系统下保存失败。 */
function safeName(value: string) {
  return value.replace(/[\\/:*?"<>|\s]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
}

export function studentNameOf(space: V2Space, studentId?: string) {
  if (!studentId) return "未知学生";
  return space.students.find((item) => item.id === studentId)?.name ?? "未知学生";
}

/** 按谈话日期倒序，同日按写入时间倒序。列表展示与导出共用，保证两处顺序一致。 */
export function sortConversations(items: ConversationRecord[]) {
  return [...items].sort((a, b) => {
    const byDay = (b.happenedAt ?? "").localeCompare(a.happenedAt ?? "");
    return byDay !== 0
      ? byDay
      : (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
  });
}

/**
 * 保存文本文件，返回落盘路径（浏览器端为 undefined）。
 *
 * 保留这个同步形态的入口给「只需要触发下载」的调用方；
 * 桌面端要走异步桥，所以真正的实现在 saveExportFile。
 */
export function downloadTextFile(filename: string, text: string) {
  void saveExportFile(filename, text, "text/markdown;charset=utf-8");
}

/** 单条谈话记录 → Markdown。先列要点，再分段还原老师实际录入的每一项。 */
export function conversationToMarkdown(
  item: ConversationRecord,
  space: V2Space,
) {
  const event = space.events.find((row) => row.id === item.eventId);
  const meta: Array<[string, string]> = [
    ["学生", studentNameOf(space, item.studentId)],
    ["谈话时间", item.happenedAt || "未填写"],
    ["谈话地点", item.location?.trim() || "未填写"],
    ["谈话主题", item.scenario?.trim() || "未填写"],
    [
      "关联事件",
      event ? `${event.type}（${event.occurredAt}）` : "独立谈话，无关联事件",
    ],
    ["成文方式", item.aiUsed ? "AI 辅助成文（已人工审核）" : "本地模板成文"],
    ["复查日期", item.nextFollowUpAt || "未设置"],
  ];
  const field = (label: string, value?: string) =>
    value?.trim() ? `\n**${label}**\n\n${value.trim()}\n` : "";
  return [
    `### 谈话记录 · ${item.scenario?.trim() || "未填写主题"}`,
    "",
    meta.map(([key, value]) => `- ${key}：${value}`).join("\n"),
    field("口述原始记录", item.rawNotes),
    field("学生主要表达", item.studentExpression),
    field("班主任沟通与引导", item.counselorGuidance),
    field("达成的共识 / 措施", item.agreements),
    field("后续跟进事项", item.followUpPlan),
    item.finalRecord?.trim()
      ? `\n**标准记录（学工系统版本）**\n\n${item.finalRecord.trim()}\n`
      : "",
  ].join("\n");
}

export function conversationsToMarkdown(
  items: ConversationRecord[],
  space: V2Space,
  options: { title: string; day: string },
) {
  if (!items.length) return `# ${options.title}\n\n暂无谈话记录。\n`;
  return [
    `# ${options.title}`,
    "",
    `导出时间：${options.day} ｜ 共 ${items.length} 条 ｜ 来自「班主任 AI 工作台」本地数据`,
    "",
    "> 本文件含学生真实姓名与谈话原文，请妥善保管，不要上传到网络。",
    "",
    "---",
    "",
    items.map((item) => conversationToMarkdown(item, space)).join("\n---\n\n"),
    "",
  ].join("\n");
}

/**
 * 导出并返回条数与落盘路径（0 表示没有内容，调用方据此给提示，不产生空文件；
 * path 在浏览器端为 undefined，桌面端是「下载」目录里的绝对路径）。
 */
export async function exportConversations(
  items: ConversationRecord[],
  space: V2Space,
  options: { title: string; fileBase: string; day: string },
): Promise<{ count: number; path?: string }> {
  if (!items.length) return { count: 0 };
  const sorted = sortConversations(items);
  const path = await saveExportFile(
    `${safeName(options.fileBase)}-${options.day}.md`,
    conversationsToMarkdown(sorted, space, options),
    "text/markdown;charset=utf-8",
  );
  return { count: sorted.length, path };
}
