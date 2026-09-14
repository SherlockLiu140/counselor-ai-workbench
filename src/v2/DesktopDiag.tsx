import { useEffect, useState } from "react";
import { copyText, isDesktopApp, openExternal, saveExportFile } from "./desktop";

/**
 * 桌面端能力自检面板（仅 `?diag=1` 时渲染）。
 *
 * 打包成 App 后，`<a download>`、`target="_blank"`、剪贴板这三类浏览器行为
 * 是否可用只能真机验证；这里把结果直接显示出来，便于打包后一屏确认。
 * 浏览器里打开同样能跑，用于对照。
 */
export function DesktopDiag() {
  const [lines, setLines] = useState<string[]>(["正在检测…"]);

  useEffect(() => {
    void (async () => {
      const out: string[] = [];
      out.push(`地址：${window.location.href}`);
      out.push(`桌面桥可用：${isDesktopApp() ? "是（Tauri）" : "否（浏览器）"}`);

      try {
        const path = await saveExportFile(
          "工作台能力自检.txt",
          "这是一份自检文件，可删除。",
          "text/plain;charset=utf-8",
        );
        out.push(
          path ? `写文件：✓ ${path}` : "写文件：浏览器下载已触发（无路径）",
        );
      } catch (e) {
        out.push(`写文件：✗ ${(e as Error).message}`);
      }

      try {
        const ok = await openExternal("https://example.com/");
        out.push(`${ok ? "打开浏览器：✓（若没弹出请检查）" : "打开浏览器：✗"}`);
      } catch (e) {
        out.push(`打开浏览器：✗ ${(e as Error).message}`);
      }

      const copied = await copyText("工作台自检文本");
      out.push(`剪贴板：${copied ? "✓（可粘贴验证）" : "✗"}`);

      setLines(out);
    })();
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: "auto 16px 16px 16px",
        zIndex: 9999,
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        padding: "12px 14px",
        font: "13px/1.7 ui-monospace, monospace",
        color: "#111",
        boxShadow: "0 6px 24px rgba(0,0,0,.12)",
      }}
    >
      <b>桌面端能力自检</b>
      {lines.map((line, index) => (
        <div key={index}>{line}</div>
      ))}
    </div>
  );
}
