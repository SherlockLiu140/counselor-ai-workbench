import { detect, render } from "./engine";
import type { Context, Finding } from "./types";
export interface Review {
  source: string;
  findings: Finding[];
  revision: number;
  confirmedRevision: number | null;
  riskAcknowledged: boolean;
  level: "L1" | "L2" | "L3";
}
export function createReview(
  source: string,
  findings: Finding[],
  level: Review["level"] = "L2",
): Review {
  return {
    source,
    findings,
    revision: 0,
    confirmedRevision: null,
    riskAcknowledged: false,
    level,
  };
}
export function changeReview(review: Review, findings: Finding[]): Review {
  return {
    ...review,
    findings,
    revision: review.revision + 1,
    confirmedRevision: null,
    riskAcknowledged: false,
  };
}
export function reviewRisks(review: Review, context: Context) {
  const result = render(review.source, review.findings);
  const residual = detect({
    ...context,
    text: result,
    options: {
      ...context.options,
      class: true,
      address: true,
      dates: true,
      medical: true,
      family: true,
    },
  });
  return {
    residual,
    pending: review.findings.filter((f) => f.ambiguous && !f.reviewed),
    restored: review.findings.filter((f) => f.action === "restore"),
  };
}
export function confirmReview(review: Review, context: Context): Review {
  const risks = reviewRisks(review, context);
  if (risks.pending.length)
    throw new Error("请逐项确认同名等身份不明确的标记。");
  if (!review.riskAcknowledged)
    throw new Error("请确认已检查剩余敏感信息及组合识别风险。");
  return { ...review, confirmedRevision: review.revision };
}
export function approvedText(review: Review): string {
  if (review.confirmedRevision !== review.revision)
    throw new Error("请先完成当前版本的人工复核。");
  return render(review.source, review.findings);
}
