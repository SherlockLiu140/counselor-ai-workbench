import { detectors } from "./detectors";
import type { Context, Detector, Finding } from "./types";

export function detect(
  ctx: Context,
  registry: Detector[] = detectors,
): Finding[] {
  const candidates = registry
    .flatMap((detector) => detector.detect(ctx))
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        b.end - b.start - (a.end - a.start) ||
        a.start - b.start,
    );
  // Keep accepted ranges ordered by source offset. Because accepted ranges never
  // overlap, only the two neighbours at the insertion point need checking.
  // This keeps dense documents at O(n log n) instead of comparing every pair.
  const selected: typeof candidates = [];
  for (const candidate of candidates) {
    let low = 0;
    let high = selected.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (selected[middle].start < candidate.start) low = middle + 1;
      else high = middle;
    }
    const previous = selected[low - 1];
    const next = selected[low];
    if (
      (previous && candidate.start < previous.end) ||
      (next && candidate.end > next.start)
    )
      continue;
    selected.splice(low, 0, candidate);
  }
  return selected.map((item, index) => ({
    ...item,
    id: `${item.start}:${item.end}:${index}`,
    original: ctx.text.slice(item.start, item.end),
    action: "replace",
    reviewed: false,
  }));
}
export function render(text: string, findings: Finding[]) {
  let cursor = 0;
  let result = "";
  for (const finding of [...findings].sort((a, b) => a.start - b.start)) {
    result +=
      text.slice(cursor, finding.start) +
      (finding.action === "restore"
        ? finding.original
        : finding.action === "delete"
          ? ""
          : finding.replacement);
    cursor = finding.end;
  }
  return result + text.slice(cursor);
}
export function markCustom(
  text: string,
  findings: Finding[],
  start: number,
  end: number,
  replacement: string,
): Finding[] {
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end > text.length ||
    start >= end
  )
    throw new Error("请在原文中选择要标记的文字。");
  const overlaps = findings.filter(
    (item) => start < item.end && end > item.start,
  );
  if (overlaps.some((item) => item.start < start || item.end > end))
    throw new Error("所选文字与已有标记部分重叠，请选择完整字段。");
  return [
    ...findings.filter((item) => !overlaps.includes(item)),
    {
      id: crypto.randomUUID(),
      start,
      end,
      type: "custom" as const,
      original: text.slice(start, end),
      replacement,
      reason: "人工新增敏感标记。",
      risk: "medium" as const,
      priority: 300,
      action: "replace" as const,
      reviewed: true,
    },
  ].sort((a, b) => a.start - b.start);
}
export function minimumNecessary(task: Context["options"]["task"]) {
  const shared =
    "身份证、联系方式、详细地址和宿舍通常没有必要交给 AI。请删除无关经历；多个已泛化字段仍可能组合识别。";
  return (
    {
      talk: "谈心谈话：保留沟通相关事实与待核实问题。",
      study: "学业分析：保留课程、成绩变化与考勤依据。",
      career: "就业指导：保留技能、岗位要求与求职意向。",
      statistics: "班级统计：优先使用汇总数据，避免逐人记录。",
      other: "其他任务：只保留完成当前目标必需的信息。",
    }[task] + shared
  );
}
