/**
 * AI 请求调试记录（仅开发模式 / 演示模式）。
 *
 * 存在的意义：上一次「Prompt 明明改了，输出却没变」无从查证，
 * 因为看不到模型真正收到的是什么。这里把一次成文的全部入参出参留痕，
 * 便于回合级排查。
 *
 * 硬约束：
 * - **绝不包含 API Key**，也绝不包含任何密钥字段；
 * - 生产构建默认关闭（只有 dev 或 ?mode=demo 才写入）；
 * - 只在浏览器内存中保存最近 N 条，不落 IndexedDB、不随备份导出。
 */

export interface AiDebugRecord {
  at: string;
  purpose: string;
  scenario?: string;
  templateId?: string;
  templateName?: string;
  matchedScenario?: string;
  systemPrompt: string;
  scenarioPrompt: string;
  personalStylePrompt: string;
  fewShotPrompt: string;
  fewShotName?: string;
  finalInstruction: string;
  userContent: string;
  fullPrompt: string;
  provider?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  rawResponse?: string;
  rawResponseLength?: number;
  finalText?: string;
  finalTextLength?: number;
  error?: string;
  /**
   * 失败时的诊断字段。
   *
   * 上一次「返回内容为空」只能看到一个笼统的结论，无法判断是模型不存在、
   * 还是输出被截断，所以这里把服务商给的结束原因、用量和原始响应体一并留痕。
   */
  finishReason?: string;
  promptTokens?: number;
  completionTokens?: number;
  /** 只返回了思考过程（reasoning_content），正文为空。 */
  hasReasoning?: boolean;
  /** 原始响应体（截断后），仅本机可见。 */
  rawBody?: string;
  /** 自动重试等过程性提示，界面已如实显示。 */
  notice?: string;
}

const MAX_RECORDS = 10;
const records: AiDebugRecord[] = [];

/** 仅开发模式或演示模式允许写入；生产默认关闭。 */
export function isAiDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (import.meta.env?.DEV) return true;
  try {
    return new URLSearchParams(window.location.search).get("mode") === "demo";
  } catch {
    return false;
  }
}

export function recordAiDebug(record: AiDebugRecord): void {
  if (!isAiDebugEnabled()) return;
  records.unshift(record);
  if (records.length > MAX_RECORDS) records.length = MAX_RECORDS;
}

export function aiDebugRecords(): readonly AiDebugRecord[] {
  return records;
}

export function clearAiDebug(): void {
  records.length = 0;
}

/** 生成一次调用的初始记录骨架（尚未发出请求）。 */
export function startAiDebugRecord(init: {
  purpose: string;
  scenario?: string;
  templateId?: string;
  templateName?: string;
  matchedScenario?: string;
  systemPrompt: string;
  scenarioPrompt: string;
  personalStylePrompt: string;
  fewShotPrompt: string;
  fewShotName?: string;
  finalInstruction: string;
  userContent: string;
  fullPrompt: string;
}): AiDebugRecord {
  return { at: new Date().toISOString(), ...init };
}
