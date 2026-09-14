import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const pwa = VitePWA({
  registerType: "prompt",
  injectRegister: "auto",
  includeAssets: ["icon.svg"],
  manifest: {
    name: "班主任 AI 工作台",
    short_name: "班主任工作台",
    start_url: "/workbench",
    scope: "/",
    display: "standalone",
    background_color: "#f5f6f3",
    theme_color: "#256350",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  },
  workbox: {
    globPatterns: ["**/*.{js,mjs,css,html,svg,wasm,bcmap,ttf,pfb}"],
    maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
    navigateFallback: "/index.html",
    cleanupOutdatedCaches: true,
  },
});

export default defineConfig(({ mode }) => {
  const desktop = mode === "desktop";
  return {
    plugins: [
      react(),
      ...(desktop
        ? [
            {
              name: "desktop-content-security-policy",
              transformIndexHtml(html: string) {
                // 桌面端没有 PWA 与 HMR，去掉本机 WebSocket 白名单；
                // 已预设的 AI 服务商域名保留（与 index.html 的 connect-src 同源白名单）。
                return html.replace(
                  /\s+ws:\/\/127\.0\.0\.1:\*\s+ws:\/\/localhost:\*/,
                  "",
                );
              },
            },
          ]
        : [pwa]),
    ],
    test: { include: ["tests/**/*.test.ts"], environment: "node" },
  };
});
