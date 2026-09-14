/**
 * 国产大模型服务商预设与直连调用。
 *
 * 边界（务必保持）：
 * - 本模块只负责「配置」和「把已确认的 payload 发出去」，不接触学生原始资料。
 * - API Key 只保存在本机浏览器，且**不写入 V2Space**，因此不会随本地备份导出，也不上传。
 * - 只有用户在 AI Privacy Gateway 中确认过去标识化 payload 之后，才允许调用本模块。
 * - 模型名迭代很快（例如 deepseek-chat / deepseek-reasoner 已于 2026-07-24 停用），
 *   因此除预设外一律支持手动填写模型 ID，并提供「拉取服务商模型列表」以免过期。
 */

export type ProviderId =
  | "deepseek"
  | "doubao"
  | "kimi"
  | "glm"
  | "qwen"
  | "agnes";

export interface ModelOption {
  id: string;
  label: string;
  note?: string;
}

export interface ProviderPreset {
  id: ProviderId;
  name: string;
  vendor: string;
  baseUrl: string;
  applyUrl: string;
  applyHint: string;
  /** 该服务商是否提供 OpenAI 兼容的 GET /models 接口。 */
  supportsModelList: boolean;
  models: ModelOption[];
  caution?: string;
}

export const PROVIDERS: ProviderPreset[] = [
  {
    id: "deepseek",
    name: "DeepSeek",
    vendor: "深度求索",
    baseUrl: "https://api.deepseek.com/v1",
    applyUrl: "https://platform.deepseek.com/api_keys",
    applyHint: "在 DeepSeek 开放平台创建 API Key",
    supportsModelList: true,
    models: [
      { id: "deepseek-v4-flash", label: "DeepSeek-V4-Flash", note: "旗舰速度版，日常成文推荐" },
      { id: "deepseek-v4-pro", label: "DeepSeek-V4-Pro", note: "最强推理，用量成本更高" },
    ],
    caution: "deepseek-chat 与 deepseek-reasoner 已于 2026-07-24 停用，填这两个会直接报错。",
  },
  {
    id: "kimi",
    name: "Kimi",
    vendor: "月之暗面",
    baseUrl: "https://api.moonshot.cn/v1",
    applyUrl: "https://platform.moonshot.cn/console/api-keys",
    applyHint: "在 Kimi 开放平台创建 API Key",
    supportsModelList: true,
    models: [
      { id: "kimi-k3", label: "Kimi K3", note: "当前旗舰，百万级上下文" },
      { id: "kimi-k2.7-code", label: "Kimi K2.7 Code", note: "编码与长文遵循更稳" },
      { id: "kimi-k2.6", label: "Kimi K2.6", note: "上一代通用模型" },
      { id: "moonshot-v1-128k", label: "Moonshot V1 128K", note: "长文本整理" },
    ],
    caution: "kimi-k2 系列旧型号已于 2026-05-25 下线，请使用 kimi-k3 及以上。",
  },
  {
    id: "glm",
    name: "智谱 GLM",
    vendor: "智谱华章",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    applyUrl: "https://open.bigmodel.cn/usercenter/apikeys",
    applyHint: "在智谱开放平台创建 API Key",
    supportsModelList: true,
    models: [
      { id: "glm-5.1", label: "GLM-5.1", note: "当前旗舰" },
      { id: "glm-4-flash", label: "GLM-4-Flash", note: "轻量、有免费额度" },
      { id: "glm-4-plus", label: "GLM-4-Plus", note: "上一代高质模型" },
    ],
  },
  {
    id: "qwen",
    name: "通义千问",
    vendor: "阿里云百炼",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    applyUrl: "https://bailian.console.aliyun.com/?apiKey=1",
    applyHint: "在阿里云百炼控制台创建 API Key",
    supportsModelList: true,
    models: [
      { id: "qwen3.5-plus", label: "Qwen3.5-Plus", note: "通用均衡，中文表现好" },
      { id: "qwen3-max", label: "Qwen3-Max", note: "最强能力" },
      { id: "qwen-plus", label: "Qwen-Plus", note: "稳定通用" },
      { id: "qwen-turbo", label: "Qwen-Turbo", note: "最快最省" },
    ],
    caution: "必须使用「兼容模式」地址，不要填 DashScope 原生接口地址。",
  },
  {
    id: "doubao",
    name: "豆包",
    vendor: "字节跳动火山方舟",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    applyUrl: "https://console.volcengine.com/ark",
    applyHint: "在火山方舟控制台创建 API Key",
    supportsModelList: false,
    models: [
      { id: "doubao-seed-2.0-pro", label: "Doubao-Seed-2.0-Pro", note: "综合能力" },
      { id: "doubao-seed-2.0-lite", label: "Doubao-Seed-2.0-Lite", note: "轻量快速" },
    ],
    caution:
      "火山方舟需先在控制台开通对应模型；部分账号要求填写推理接入点 ID（ep- 开头）。该服务商不提供模型列表接口，请照控制台显示的模型名填写。",
  },
  {
    id: "agnes",
    name: "Agens AI",
    vendor: "Sapiens AI（免费）",
    baseUrl: "https://apihub.agnes-ai.com/v1",
    applyUrl: "https://platform.agnes-ai.com",
    applyHint: "在 Agens 平台注册并创建免费 API Key",
    supportsModelList: true,
    models: [
      { id: "agnes-2.5-pro-beta", label: "Agnes-2.5-Pro-Beta", note: "当前旗舰，免费" },
      { id: "agnes-2.0-flash", label: "Agnes-2.0-Flash", note: "轻量快速，免费" },
    ],
    caution:
      "Agens 官宣其模型 API 无限期免费，适合不想付费的老师。模型名迭代快，若报 404 可点「拉取模型列表」取最新 ID。",
  },
];

/**
 * 各服务商 API 的 origin 白名单。
 *
 * 之所以显式导出：页面 CSP 的 `connect-src` 必须逐个放行这些域名，
 * 否则浏览器会直接掐断请求（表现为 `TypeError: Failed to fetch`），
 * 与「服务商不允许浏览器访问」完全无关。`tests/providers.test.ts`
 * 会校验 index.html 与 src-tauri/tauri.conf.json 与之保持一致。
 */
export const PROVIDER_ORIGINS = PROVIDERS.map(
  (preset) => new URL(preset.baseUrl).origin,
);

/** 从整条 CSP 或单条指令中取出 connect-src 允许的来源；没有该指令时返回 undefined。 */
export function connectSrcSources(csp: string): string[] | undefined {
  const match = /connect-src([^;]*)/.exec(csp);
  if (!match) return undefined;
  return match[1].trim().split(/\s+/).filter(Boolean);
}

/**
 * 判断某个 origin 是否被 connect-src 放行。
 * 没有 connect-src（或压根没有 CSP）时返回 true，交给浏览器默认策略。
 */
export function isOriginAllowedByCsp(csp: string, origin: string): boolean {
  const sources = connectSrcSources(csp);
  if (!sources) return true;
  return sources.some(
    (source) => source === origin || source === "*" || source === "https:",
  );
}

/** 读取页面自身的 CSP meta；桌面端由 Tauri 注入响应头时这里取不到，返回空串。 */
function pageCsp(): string {
  if (typeof document === "undefined") return "";
  return (
    document
      .querySelector('meta[http-equiv="Content-Security-Policy"]')
      ?.getAttribute("content") ?? ""
  );
}

/**
 * 发请求前自检：页面 CSP 是否放行了该服务商。
 *
 * 不放行时请求必然被浏览器拦截，提前给出可读原因，
 * 避免把「自己的安全策略挡住了」误判成「服务商不允许浏览器访问」。
 */
function assertConnectAllowed(preset: ProviderPreset): void {
  const csp = pageCsp();
  if (!csp) return;
  const origin = new URL(preset.baseUrl).origin;
  if (isOriginAllowedByCsp(csp, origin)) return;
  throw new Error(
    `本页面的安全策略（CSP）未放行 ${origin}，请求不可能发出。` +
      `请把该域名补进 index.html 的 connect-src 白名单；桌面版还需同步 src-tauri/tauri.conf.json。`,
  );
}

export interface ProviderConfig {
  apiKey: string;
  model: string;
}

export interface AiSettings {
  activeProvider: ProviderId | "";
  providers: Partial<Record<ProviderId, ProviderConfig>>;
}

/** 独立存储键：与 V2Space 分离，保证 Key 不进入本地备份，也不触发数据迁移。 */
export const AI_SETTINGS_STORAGE_KEY = "counselor-ai-providers";

const STORAGE_KEY = AI_SETTINGS_STORAGE_KEY;

const REQUEST_TIMEOUT_MS = 60_000;

export const emptyAiSettings = (): AiSettings => ({
  activeProvider: "",
  providers: {},
});

export function providerById(id: ProviderId): ProviderPreset {
  const preset = PROVIDERS.find((item) => item.id === id);
  if (!preset) throw new Error("未知的 AI 服务商。");
  return preset;
}

export function loadAiSettings(): AiSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyAiSettings();
    const parsed = JSON.parse(raw) as Partial<AiSettings>;
    return {
      activeProvider: (parsed.activeProvider ?? "") as AiSettings["activeProvider"],
      providers: parsed.providers ?? {},
    };
  } catch {
    return emptyAiSettings();
  }
}

export function saveAiSettings(settings: AiSettings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* 隐私模式下 localStorage 可能不可用，降级为本次会话内有效。 */
  }
}

export function providerConfig(
  settings: AiSettings,
  id: ProviderId,
): ProviderConfig {
  const preset = providerById(id);
  const saved = settings.providers[id];
  return {
    apiKey: saved?.apiKey ?? "",
    model: saved?.model ?? preset.models[0]?.id ?? "",
  };
}

/** 该服务商是否已填 Key，可用于启用「直接调用」。 */
export function isProviderReady(settings: AiSettings, id: ProviderId): boolean {
  return providerConfig(settings, id).apiKey.trim().length > 0;
}

/** 已启用且填好 Key 的服务商；未显式选择时取第一个可用的。 */
export function activeProvider(
  settings: AiSettings,
): { preset: ProviderPreset; config: ProviderConfig } | undefined {
  const candidates: ProviderId[] = settings.activeProvider
    ? [settings.activeProvider]
    : PROVIDERS.map((item) => item.id);
  for (const id of candidates) {
    if (!isProviderReady(settings, id)) continue;
    const config = providerConfig(settings, id);
    if (!config.model.trim()) continue;
    return { preset: providerById(id), config };
  }
  return undefined;
}

function extractErrorMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: string } | string;
      message?: string;
    };
    if (typeof parsed.error === "string") return parsed.error;
    return parsed.error?.message ?? parsed.message ?? "";
  } catch {
    return body.slice(0, 160);
  }
}

function describeHttpError(
  preset: ProviderPreset,
  status: number,
  body: string,
): string {
  const detail = extractErrorMessage(body);
  const suffix = detail ? `服务商说明：${detail}` : "";
  if (status === 401 || status === 403)
    return `${preset.name} 鉴权失败（HTTP ${status}）。请确认 API Key 是否正确、是否属于该服务商。${suffix}`;
  if (status === 429)
    return `${preset.name} 触发限流（HTTP ${status}）。请稍后重试或降低调用频率。${suffix}`;
  if (status === 404)
    return `${preset.name} 未找到该模型（HTTP 404）。请在「AI 设置」中重新选择或填写模型 ID。${suffix}`;
  return `${preset.name} 返回错误（HTTP ${status}）。${suffix}`;
}

async function withTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  outer?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const forward = () => controller.abort();
  outer?.addEventListener("abort", forward);
  try {
    return await run(controller.signal);
  } catch (cause) {
    const error = cause as Error;
    if (error.name === "AbortError")
      throw new Error("请求已超时或被取消，请稍后重试。");
    if (error instanceof TypeError)
      throw new Error(
        "无法连接服务商。请检查网络或代理设置；按 F12 打开控制台，可以看到请求被拦截的具体原因。",
      );
    throw error;
  } finally {
    window.clearTimeout(timer);
    outer?.removeEventListener("abort", forward);
  }
}

function authHeaders(config: ProviderConfig): Record<string, string> {
  const apiKey = config.apiKey.trim();
  if (!apiKey) throw new Error("请先填写 API Key。");
  return { Authorization: `Bearer ${apiKey}` };
}

/** 拉取服务商真实可用的模型 ID，避免预设模型名过期。 */
export async function fetchRemoteModels(
  preset: ProviderPreset,
  config: ProviderConfig,
  signal?: AbortSignal,
): Promise<string[]> {
  if (!preset.supportsModelList)
    throw new Error(`${preset.name} 不提供模型列表接口，请照控制台显示的模型名手动填写。`);
  assertConnectAllowed(preset);
  return withTimeout(async (inner) => {
    const response = await fetch(`${preset.baseUrl}/models`, {
      headers: authHeaders(config),
      signal: inner,
    });
    const text = await response.text();
    if (!response.ok)
      throw new Error(describeHttpError(preset, response.status, text));
    const data = JSON.parse(text) as { data?: Array<{ id?: string }> };
    const ids = (data.data ?? [])
      .map((item) => item.id)
      .filter((id): id is string => !!id);
    if (!ids.length) throw new Error(`${preset.name} 未返回可用模型。`);
    return ids.sort();
  }, signal);
}

/**
 * 连通性自检：优先用不消耗额度的模型列表接口；
 * 豆包这类没有列表接口的服务商，用一次极短对话验证。
 */
export async function testConnection(
  preset: ProviderPreset,
  config: ProviderConfig,
  signal?: AbortSignal,
): Promise<string> {
  if (!config.model.trim()) throw new Error("请先选择或填写模型名称。");
  assertConnectAllowed(preset);
  if (preset.supportsModelList) {
    const models = await fetchRemoteModels(preset, config, signal);
    return `连接正常，该 Key 可见 ${models.length} 个模型。`;
  }
  await withTimeout(async (inner) => {
    const response = await fetch(`${preset.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(config) },
      body: JSON.stringify({
        model: config.model.trim(),
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
        stream: false,
      }),
      signal: inner,
    });
    const text = await response.text();
    if (!response.ok)
      throw new Error(describeHttpError(preset, response.status, text));
  }, signal);
  return `连接正常，模型 ${config.model} 可调用。`;
}

/**
 * 成文所需的输出上限。
 *
 * 之前完全没有传这个参数，输出长度交给服务商默认值——
 * 在无长度锚点时模型天然倾向输出保守的短摘要，这正是「Prompt 改了效果没变」的真因之一。
 * 中文 1 字约 0.7～1 token，2048 token 足以容纳 700～1500 中文字，留足余量。
 */
export const DEFAULT_MAX_TOKENS = 2048;

/** 成文的默认温度：稍高一点让表达更自然，但不至于发散到编造事实。 */
export const DEFAULT_TEMPERATURE = 0.5;

/**
 * 首次返回为空时自动重试所用的输出上限。
 *
 * 为什么需要它：思考型模型会先把输出额度花在思维链上，
 * 2048 token 常常在还没写出正文时就被用光（finish_reason=length、content 为空）。
 * 此时把上限翻倍重试一次通常就能拿到正文，比直接甩给老师一句「返回内容为空」有用得多。
 */
export const RETRY_MAX_TOKENS = 8192;

/** 保留到调试面板的原始响应体上限（字符），避免一条记录把界面撑爆。 */
const RAW_BODY_LIMIT = 2000;

/** 一次调用的诊断信息——失败时用来解释「到底是哪种不对」。 */
export interface AiCallDetails {
  provider: string;
  model: string;
  /** 服务商给出的结束原因：length（被截断）/ stop / content_filter … */
  finishReason?: string;
  promptTokens?: number;
  completionTokens?: number;
  /** 只返回了思考过程（reasoning_content），正文为空。 */
  hasReasoning: boolean;
  /** 原始响应体（截断），仅用于本机调试面板，不会外发。 */
  rawBody: string;
}

/** 带诊断信息的 AI 调用错误；调用方可用 aiCallDetails() 取出细节。 */
export class AiCallError extends Error {
  readonly details: AiCallDetails;
  constructor(message: string, details: AiCallDetails) {
    super(message);
    this.name = "AiCallError";
    this.details = details;
  }
}

/** 从异常中取出 AI 调用诊断信息；不是 AI 调用错误时返回 undefined。 */
export function aiCallDetails(cause: unknown): AiCallDetails | undefined {
  return cause instanceof AiCallError ? cause.details : undefined;
}

interface ChatOutcome {
  text: string;
  finishReason?: string;
  promptTokens?: number;
  completionTokens?: number;
  hasReasoning: boolean;
  rawBody: string;
}

/** 兼容 content 为字符串与新版 parts 数组两种形态，空响应不再被误当成有内容。 */
function messageText(message: unknown): string {
  const content = (message as { content?: unknown } | undefined)?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content))
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        const text = (part as { text?: unknown } | null)?.text;
        return typeof text === "string" ? text : "";
      })
      .join("")
      .trim();
  return "";
}

/** 发一次请求并解析出正文与诊断字段；不做重试。 */
async function sendChat(
  preset: ProviderPreset,
  config: ProviderConfig,
  prompt: string,
  maxTokens: number,
  temperature: number,
  signal?: AbortSignal,
): Promise<ChatOutcome> {
  const model = config.model.trim();
  if (!model) throw new Error(`请先为 ${preset.name} 选择或填写模型名称。`);
  assertConnectAllowed(preset);
  return withTimeout(async (inner) => {
    const response = await fetch(`${preset.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(config) },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        stream: false,
        temperature,
        max_tokens: maxTokens,
      }),
      signal: inner,
    });
    const text = await response.text();
    if (!response.ok)
      throw new Error(describeHttpError(preset, response.status, text));
    const rawBody =
      text.length > RAW_BODY_LIMIT ? `${text.slice(0, RAW_BODY_LIMIT)}…` : text;
    let data: {
      error?: unknown;
      choices?: Array<{
        finish_reason?: string;
        message?: { content?: unknown; reasoning_content?: unknown };
      }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    try {
      data = JSON.parse(text) as typeof data;
    } catch {
      // 说明中间有代理或网关改写了响应——把原文带出来，否则无从下手。
      throw new Error(
        `${preset.name} 返回的不是 JSON（HTTP ${response.status}）。` +
          `响应可能被网络代理或网关改写了，原文前 160 字：${text.slice(0, 160)}`,
      );
    }
    // 少数网关会用 200 + error 字段返回失败，这里不能再当成正常响应。
    if (data.error) {
      const detail = extractErrorMessage(text) || "未说明原因";
      throw new Error(`${preset.name} 返回了错误信息：${detail}`);
    }
    const choice = data.choices?.[0];
    const reasoning = (choice?.message as { reasoning_content?: unknown } | undefined)
      ?.reasoning_content;
    return {
      text: messageText(choice?.message),
      finishReason:
        typeof choice?.finish_reason === "string" ? choice.finish_reason : undefined,
      promptTokens: data.usage?.prompt_tokens,
      completionTokens: data.usage?.completion_tokens,
      hasReasoning: typeof reasoning === "string" && reasoning.trim().length > 0,
      rawBody,
    };
  }, signal);
}

/** 用一句话说明「为什么没有正文」，用于重试提示与最终报错。 */
function describeEmptyReason(outcome: ChatOutcome): string {
  if (outcome.finishReason === "length") return "输出被长度上限截断";
  if (outcome.hasReasoning) return "只返回了思考过程";
  if (outcome.finishReason === "content_filter") return "被内容安全策略拦截";
  return "服务商返回了空正文";
}

/** 构造带诊断信息的空返回错误；提示要让老师知道下一步该做什么。 */
function emptyResponseError(
  preset: ProviderPreset,
  config: ProviderConfig,
  outcome: ChatOutcome,
  maxTokens: number,
): AiCallError {
  const model = config.model.trim();
  const tag = `（模型 ${model}，finish_reason=${outcome.finishReason ?? "未返回"}）`;
  let message: string;
  if (outcome.finishReason === "length")
    message =
      `${preset.name} 没有返回正文：输出长度上限（max_tokens=${maxTokens}）被用尽，正文被截断。` +
      `多见于所选模型默认开启思考、额度先被思维链耗光。请改用非思考模型，或稍后重试。${tag}`;
  else if (outcome.hasReasoning)
    message =
      `${preset.name} 只返回了思考过程，没有返回正文。` +
      `通常是该模型默认开启思考，输出额度被思维过程占满，建议改用非思考模型后重试。${tag}`;
  else if (outcome.finishReason === "content_filter")
    message =
      `${preset.name} 的内容安全策略拦截了这次返回，没有生成正文。` +
      `请检查脱敏后的内容里是否有敏感表述。${tag}`;
  else
    message =
      `${preset.name} 返回内容为空。请确认所选模型是否可用` +
      `（可到「AI 设置」点「拉取模型列表」核对模型 ID）。${tag}` +
      (outcome.rawBody ? ` 响应片段：${outcome.rawBody.slice(0, 120)}` : "");
  return new AiCallError(message, {
    provider: preset.name,
    model,
    finishReason: outcome.finishReason,
    promptTokens: outcome.promptTokens,
    completionTokens: outcome.completionTokens,
    hasReasoning: outcome.hasReasoning,
    rawBody: outcome.rawBody,
  });
}

export interface ChatCallOptions {
  maxTokens?: number;
  temperature?: number;
  /**
   * 自动重试前的通知回调。
   *
   * 重试会真实产生一次外部请求，界面上必须如实说明，
   * 不能让老师以为「只点了一次、只发了一次」。
   */
  onNotice?: (text: string) => void;
}

/**
 * 调用对话补全。
 *
 * 传入的 prompt 必须是 Privacy Gateway 中已经人工确认过的去标识化 payload，
 * 本函数不做任何学生身份还原，返回值交给调用方在本地恢复。
 *
 * 空返回的处理顺序：先判断是不是「额度被截断 / 只回了思考过程」，
 * 是则自动加大上限重试一次；仍为空才抛出带 finish_reason 与响应片段的错误。
 */
export async function callChatCompletion(
  preset: ProviderPreset,
  config: ProviderConfig,
  prompt: string,
  signal?: AbortSignal,
  opts?: ChatCallOptions,
): Promise<string> {
  const temperature = opts?.temperature ?? DEFAULT_TEMPERATURE;
  const maxTokens = opts?.maxTokens ?? DEFAULT_MAX_TOKENS;
  const first = await sendChat(preset, config, prompt, maxTokens, temperature, signal);
  if (first.text) return first.text;

  const retriable = first.finishReason === "length" || first.hasReasoning;
  if (retriable) {
    const retryTokens = Math.max(maxTokens * 2, RETRY_MAX_TOKENS);
    opts?.onNotice?.(
      `${preset.name} 首次没有返回正文（${describeEmptyReason(first)}），` +
        `已自动把输出上限从 ${maxTokens} 提高到 ${retryTokens} 再试一次。`,
    );
    const retry = await sendChat(
      preset,
      config,
      prompt,
      retryTokens,
      temperature,
      signal,
    );
    if (retry.text) return retry.text;
    throw emptyResponseError(preset, config, retry, retryTokens);
  }
  throw emptyResponseError(preset, config, first, maxTokens);
}
