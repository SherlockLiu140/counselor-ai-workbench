import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AiCallError,
  DEFAULT_MAX_TOKENS,
  RETRY_MAX_TOKENS,
  aiCallDetails,
  callChatCompletion,
  providerById,
  type ProviderConfig,
} from "../src/v2/providers";

/**
 * 「AI 返回内容为空」这一类失败的回归测试。
 *
 * 背景：老师只看到一句「返回内容为空」，无从判断是模型不存在、还是输出被截断。
 * 这里锁定三件事：
 * 1. 空返回必须被分类（截断 / 只回了思考过程 / 内容过滤 / 未知），错误里带 finish_reason；
 * 2. 截断或只回思考过程时，自动加大输出上限重试一次（并如实通知界面）；
 * 3. 响应体即使为空/异常，也要留下可查证的原文，不能再丢掉证据。
 */

const preset = providerById("deepseek");
const config: ProviderConfig = {
  apiKey: "sk-test-key",
  model: "deepseek-v4-flash",
};

/** withTimeout 里用到 window.setTimeout，node 环境下补一个最小替身。 */
beforeEach(() => {
  (globalThis as unknown as { window: unknown }).window = {
    setTimeout,
    clearTimeout,
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (globalThis as { fetch?: unknown }).fetch;
});

interface Call {
  url: string;
  body: Record<string, unknown>;
}

/** 用一串预设响应伪装 fetch，并按顺序记录每次请求体。 */
function stubFetch(
  responses: Array<
    | { status?: number; json?: unknown; text?: string }
    | (() => { status?: number; json?: unknown; text?: string })
  >,
): Call[] {
  const calls: Call[] = [];
  let index = 0;
  vi.stubGlobal("fetch", (url: string, init?: { body?: string }) => {
    calls.push({ url, body: JSON.parse(init?.body ?? "{}") });
    const item = responses[Math.min(index, responses.length - 1)];
    index += 1;
    const spec = typeof item === "function" ? item() : item;
    const status = spec?.status ?? 200;
    const text =
      spec?.text ??
      JSON.stringify(spec?.json ?? { choices: [{ message: { content: "" } }] });
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      text: () => Promise.resolve(text),
    });
  });
  return calls;
}

const EMPTY_TRUNCATED = {
  choices: [{ finish_reason: "length", message: { content: "" } }],
};
const EMPTY_REASONING = {
  choices: [
    {
      finish_reason: "stop",
      message: { content: "", reasoning_content: "我先想想该怎么组织……" },
    },
  ],
};

describe("AI 调用：正常返回", () => {
  it("取出正文并去掉首尾空白", async () => {
    stubFetch([
      { json: { choices: [{ message: { content: "  正式记录正文。\n" } }] } },
    ]);
    const text = await callChatCompletion(preset, config, "整理这段记录");
    expect(text).toBe("正式记录正文。");
  });

  it("content 为 parts 数组时同样能取出正文", async () => {
    stubFetch([
      {
        json: {
          choices: [
            {
              message: {
                content: [{ type: "text", text: "第一段" }, { type: "text", text: "第二段" }],
              },
            },
          ],
        },
      },
    ]);
    expect(await callChatCompletion(preset, config, "整理")).toBe("第一段第二段");
  });

  it("请求体带上显式输出上限与温度", async () => {
    const calls = stubFetch([
      { json: { choices: [{ message: { content: "正文" } }] } },
    ]);
    await callChatCompletion(preset, config, "整理");
    expect(calls[0].body.max_tokens).toBe(DEFAULT_MAX_TOKENS);
    expect(calls[0].body.stream).toBe(false);
  });
});

describe("AI 调用：空返回分类与自动重试", () => {
  it("被长度上限截断时自行加大上限重试，并通知界面", async () => {
    const calls = stubFetch([
      { json: EMPTY_TRUNCATED },
      { json: { choices: [{ message: { content: "重试后的正文" } }] } },
    ]);
    const notices: string[] = [];
    const text = await callChatCompletion(preset, config, "整理", undefined, {
      onNotice: (value) => notices.push(value),
    });

    expect(text).toBe("重试后的正文");
    expect(calls).toHaveLength(2);
    expect(calls[0].body.max_tokens).toBe(DEFAULT_MAX_TOKENS);
    expect(calls[1].body.max_tokens).toBe(RETRY_MAX_TOKENS);
    // 重试会真实产生一次外部请求，必须在界面上说明
    expect(notices[0]).toContain("输出被长度上限截断");
    expect(notices[0]).toContain(String(RETRY_MAX_TOKENS));
  });

  it("只返回思考过程时同样重试", async () => {
    const calls = stubFetch([
      { json: EMPTY_REASONING },
      { json: { choices: [{ message: { content: "重试后的正文" } }] } },
    ]);
    expect(await callChatCompletion(preset, config, "整理")).toBe("重试后的正文");
    expect(calls).toHaveLength(2);
  });

  it("重试后仍为空时给出可读原因，并保留诊断信息", async () => {
    stubFetch([{ json: EMPTY_TRUNCATED }, { json: EMPTY_TRUNCATED }]);

    const error = await callChatCompletion(preset, config, "整理").catch(
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(AiCallError);

    const details = aiCallDetails(error);
    expect(details?.finishReason).toBe("length");
    expect(details?.model).toBe("deepseek-v4-flash");
    expect(details?.rawBody).toContain("length");

    const message = (error as Error).message;
    expect(message).toContain("finish_reason=length");
    expect(message).toContain(`max_tokens=${RETRY_MAX_TOKENS}`);
    // 不能只说「为空」，要给出下一步
    expect(message).toMatch(/非思考模型|重试/);
  });

  it("原因未知的空返回不盲目重试，但错误里带响应片段便于查证", async () => {
    const calls = stubFetch([
      {
        json: {
          choices: [{ finish_reason: "stop", message: { content: "" } }],
          usage: { prompt_tokens: 900, completion_tokens: 0 },
        },
      },
    ]);

    const error = await callChatCompletion(preset, config, "整理").catch(
      (cause: unknown) => cause,
    );
    // 只发一次：原因不明时重试只是白白多花一次额度
    expect(calls).toHaveLength(1);
    const details = aiCallDetails(error);
    expect(details?.promptTokens).toBe(900);
    expect(details?.rawBody).toContain("prompt_tokens");
    expect((error as Error).message).toContain("响应片段");
  });

  it("内容安全策略拦截时说明是被拦截，而不是模型不可用", async () => {
    stubFetch([
      {
        json: {
          choices: [{ finish_reason: "content_filter", message: { content: "" } }],
        },
      },
    ]);
    const error = await callChatCompletion(preset, config, "整理").catch(
      (cause: unknown) => cause,
    );
    expect((error as Error).message).toContain("内容安全策略拦截");
  });
});

describe("AI 调用：异常响应体", () => {
  it("用 200 携带 error 字段时不能当成正常返回", async () => {
    stubFetch([
      { json: { error: { message: "Model Not Exist" } } },
    ]);
    await expect(callChatCompletion(preset, config, "整理")).rejects.toThrow(
      /Model Not Exist/,
    );
  });

  it("响应不是 JSON 时提示可能被代理改写，并带出原文", async () => {
    stubFetch([{ text: "<html>502 Bad Gateway</html>" }]);
    const error = await callChatCompletion(preset, config, "整理").catch(
      (cause: unknown) => cause,
    );
    expect((error as Error).message).toContain("不是 JSON");
    expect((error as Error).message).toContain("502 Bad Gateway");
  });

  it("HTTP 错误仍按服务商说明分类", async () => {
    stubFetch([{ status: 404, json: { error: { message: "model not found" } } }]);
    await expect(callChatCompletion(preset, config, "整理")).rejects.toThrow(
      /未找到该模型/,
    );
  });

  it("未填模型时直接拒绝，不发请求", async () => {
    const calls = stubFetch([{ json: {} }]);
    await expect(
      callChatCompletion(preset, { apiKey: "sk-test", model: "  " }, "整理"),
    ).rejects.toThrow(/模型名称/);
    expect(calls).toHaveLength(0);
  });
});
