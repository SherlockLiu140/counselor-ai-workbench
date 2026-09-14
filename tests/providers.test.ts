import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PROVIDERS,
  PROVIDER_ORIGINS,
  activeProvider,
  connectSrcSources,
  emptyAiSettings,
  isOriginAllowedByCsp,
  isProviderReady,
  providerById,
  providerConfig,
  type AiSettings,
  type ProviderId,
} from "../src/v2/providers";

describe("AI 服务商预设", () => {
  it("六家服务商都有可用配置", () => {
    expect(PROVIDERS.map((preset) => preset.id).sort()).toEqual([
      "agnes",
      "deepseek",
      "doubao",
      "glm",
      "kimi",
      "qwen",
    ]);
    for (const preset of PROVIDERS) {
      expect(preset.baseUrl).toMatch(/^https:\/\//);
      expect(preset.applyUrl).toMatch(/^https:\/\//);
      expect(preset.models.length).toBeGreaterThan(0);
      for (const model of preset.models) {
        expect(model.id).not.toContain(" ");
        expect(model.label.length).toBeGreaterThan(0);
      }
    }
  });

  it("不预设已停用的模型名，避免填了 Key 也调不通", () => {
    const ids = PROVIDERS.flatMap((preset) =>
      preset.models.map((model) => model.id),
    );
    expect(ids).not.toContain("deepseek-chat");
    expect(ids).not.toContain("deepseek-reasoner");
    expect(ids).not.toContain("kimi-k2-0905-preview");
    expect(ids).toContain("deepseek-v4-flash");
    expect(ids).toContain("kimi-k3");
  });

  it("未保存配置时回落到预设的第一个模型", () => {
    const settings = emptyAiSettings();
    expect(providerConfig(settings, "deepseek")).toEqual({
      apiKey: "",
      model: "deepseek-v4-flash",
    });
    expect(isProviderReady(settings, "deepseek")).toBe(false);
  });

  it("保存的 Key 与模型覆盖预设", () => {
    const settings: AiSettings = {
      activeProvider: "glm",
      providers: { glm: { apiKey: "sk-test", model: "glm-4-flash" } },
    };
    expect(providerConfig(settings, "glm")).toEqual({
      apiKey: "sk-test",
      model: "glm-4-flash",
    });
    expect(isProviderReady(settings, "glm")).toBe(true);
  });

  it("空白 Key 不算已配置", () => {
    const settings: AiSettings = {
      activeProvider: "",
      providers: { kimi: { apiKey: "   ", model: "kimi-k3" } },
    };
    expect(isProviderReady(settings, "kimi")).toBe(false);
  });

  it("优先使用显式选择的服务商", () => {
    const settings: AiSettings = {
      activeProvider: "kimi",
      providers: {
        deepseek: { apiKey: "sk-a", model: "deepseek-v4-flash" },
        kimi: { apiKey: "sk-b", model: "kimi-k3" },
      },
    };
    expect(activeProvider(settings)?.preset.id).toBe("kimi");
    expect(activeProvider(settings)?.config.model).toBe("kimi-k3");
  });

  it("未显式选择时用第一个已填 Key 的服务商", () => {
    const settings: AiSettings = {
      activeProvider: "",
      providers: { glm: { apiKey: "sk-c", model: "glm-5.1" } },
    };
    expect(activeProvider(settings)?.preset.id).toBe("glm");
  });

  it("没有可用配置时返回 undefined，保持离线可用", () => {
    expect(activeProvider(emptyAiSettings())).toBeUndefined();
    const emptyModel: AiSettings = {
      activeProvider: "qwen",
      providers: { qwen: { apiKey: "sk-d", model: "" } },
    };
    expect(activeProvider(emptyModel)).toBeUndefined();
  });

  it("未知服务商抛出可读错误", () => {
    expect(() => providerById("nope" as ProviderId)).toThrow();
  });
});

/** 直读仓库静态文件；测试跑在 node 环境，可用来守卫「配置之间必须一致」。 */
function readRepoFile(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("页面 CSP 必须放行已预设的 AI 服务商", () => {
  const targets = [
    { name: "index.html", content: readRepoFile("../index.html") },
    {
      name: "src-tauri/tauri.conf.json",
      content: readRepoFile("../src-tauri/tauri.conf.json"),
    },
  ];

  it("五家服务商的 origin 全部可枚举", () => {
    expect(PROVIDER_ORIGINS).toEqual([
      "https://api.deepseek.com",
      "https://api.moonshot.cn",
      "https://open.bigmodel.cn",
      "https://dashscope.aliyuncs.com",
      "https://ark.cn-beijing.volces.com",
      "https://apihub.agnes-ai.com",
    ]);
  });

  for (const target of targets) {
    it(`${target.name} 的 connect-src 覆盖每一家服务商`, () => {
      for (const origin of PROVIDER_ORIGINS) {
        expect(
          isOriginAllowedByCsp(target.content, origin),
          `${target.name} 的 connect-src 缺少 ${origin}，浏览器会直接掐断请求（Failed to fetch）`,
        ).toBe(true);
      }
    });

    it(`${target.name} 用具名白名单，不放通配`, () => {
      const sources = connectSrcSources(target.content);
      expect(sources).toBeTruthy();
      for (const wildcard of ["*", "https:", "http:"]) {
        expect(
          sources,
          `${target.name} 不应出现 ${wildcard}——放通配等于放弃 Local First 的收窄边界`,
        ).not.toContain(wildcard);
      }
    });
  }

  it("未放行的域名会被判定为发不出去", () => {
    const csp = "default-src 'self'; connect-src 'self' ws://127.0.0.1:*";
    expect(isOriginAllowedByCsp(csp, "https://api.deepseek.com")).toBe(false);
    expect(isOriginAllowedByCsp(csp, "https://example.com")).toBe(false);
    // 没有 connect-src 时不自作主张，交给浏览器默认策略
    expect(isOriginAllowedByCsp("default-src 'self'", "https://x.example")).toBe(
      true,
    );
  });

  it("通配写法本身算放行（所以上面才要禁止仓库里出现）", () => {
    expect(isOriginAllowedByCsp("connect-src *", "https://x.example")).toBe(true);
    expect(isOriginAllowedByCsp("connect-src https:", "https://x.example")).toBe(
      true,
    );
  });

  it("桌面端构建只去掉本机 WebSocket，不丢掉 AI 域名", () => {
    const viteConfig = readRepoFile("../vite.config.ts");
    // 若有人把整条 connect-src 覆写成 'self'，桌面版会永久失去 AI 能力
    expect(viteConfig).not.toContain(`"connect-src 'self'",`);

    const desktopHtml = readRepoFile("../index.html").replace(
      /\s+ws:\/\/127\.0\.0\.1:\*\s+ws:\/\/localhost:\*/,
      "",
    );
    expect(desktopHtml).not.toContain("ws://127.0.0.1");
    for (const origin of PROVIDER_ORIGINS) {
      expect(desktopHtml).toContain(origin);
    }
  });
});
