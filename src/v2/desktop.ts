/**
 * 桌面端（Tauri）能力桥。
 *
 * 打包成 App 后页面跑在 `tauri://localhost` 这个自定义协议里，浏览器那套
 * 「下载」「开新窗口」「读剪贴板」并不会自动生效，表现就是**点了没反应**：
 *
 * - `<a download>`：需要 WebView 注册下载代理，Tauri 默认不注册，blob 下载被丢弃；
 * - `target="_blank"`：WebView 只会在注册了「新窗口处理器」时才允许开窗，
 *   默认返回 nil，点击被静默吞掉 —— 这就是「学工系统按钮不跳转」的原因；
 * - `navigator.clipboard`：自定义协议不一定是安全上下文，部分 WebKit 版本下直接是 undefined。
 *
 * 所以这三类操作统一走这里：桌面端调用 Rust 命令，浏览器端原样退回老方案。
 * 边界不变：只在本地写文件、只调用系统默认浏览器，不联网、不上传。
 *
 * 不引入 `@tauri-apps/api`：它只是`__TAURI_INTERNALS__.invoke` 的一层封装，
 * Tauri 2 在任何配置下都会注入这个内部对象，少一个依赖就少一处版本漂移。
 */

type TauriInvoke = (
  command: string,
  args?: Record<string, unknown>,
) => Promise<unknown>;

function tauriInvoke(): TauriInvoke | undefined {
  if (typeof window === "undefined") return undefined;
  const internals = (
    window as unknown as { __TAURI_INTERNALS__?: { invoke?: TauriInvoke } }
  ).__TAURI_INTERNALS__;
  const fn = internals?.invoke;
  return typeof fn === "function" ? fn.bind(internals) : undefined;
}

/** 是否运行在打包后的桌面 App 里（网页与浏览器测试环境返回 false）。 */
export function isDesktopApp(): boolean {
  return !!tauriInvoke();
}

/* ------------------------------ 外部链接 ------------------------------ */

/**
 * 打开外部链接。
 *
 * 桌面端交给系统默认浏览器（Rust 侧只放行 http / https），
 * 浏览器端开新标签页。返回是否成功发起。
 */
export async function openExternal(url: string): Promise<boolean> {
  const run = tauriInvoke();
  if (!run) {
    window.open(url, "_blank", "noopener,noreferrer");
    return true;
  }
  try {
    await run("open_external", { url });
    return true;
  } catch {
    return false;
  }
}

/**
 * 外链 `<a>` 的通用属性。
 *
 * 保留 href（悬停能看到地址、浏览器里可中键新开），只在桌面端接管点击，
 * 避免 `target="_blank"` 被 WebView 静默丢弃。
 */
export function externalLinkProps(url: string) {
  return {
    href: url,
    target: "_blank" as const,
    rel: "noreferrer",
    onClick: (event: { preventDefault: () => void }) => {
      if (!isDesktopApp()) return;
      event.preventDefault();
      void openExternal(url);
    },
  };
}

/* ------------------------------- 文件保存 ------------------------------ */

/** 浏览器端的兜底下载：Blob + `<a download>`。 */
export function browserDownload(
  fileName: string,
  data: Blob | string,
  mime = "application/octet-stream",
) {
  const blob =
    typeof data === "string" ? new Blob([data], { type: mime }) : data;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * 保存导出文件。
 *
 * 桌面端：写入系统「下载」目录（重名自动加序号），返回落盘路径；
 * 浏览器端：走 Blob 下载，返回 undefined（浏览器不给路径）。
 */
export async function saveExportFile(
  fileName: string,
  data: Blob | string,
  mime = "application/octet-stream",
): Promise<string | undefined> {
  const run = tauriInvoke();
  if (!run) {
    browserDownload(fileName, data, mime);
    return undefined;
  }
  const blob = typeof data === "string" ? new Blob([data], { type: mime }) : data;
  const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
  const path = await run("save_export_file", { fileName, bytes });
  return typeof path === "string" ? path : undefined;
}

/** 保存完成后给老师看的一句话：桌面端带上落盘位置。 */
export function savedMessage(path: string | undefined, browserText: string) {
  if (!path) return browserText;
  const name = path.split(/[\\/]/).pop() ?? path;
  return `已保存到下载文件夹：${name}`;
}

/** 在文件管理器里定位刚导出的文件。 */
export async function revealInFolder(path: string): Promise<boolean> {
  const run = tauriInvoke();
  if (!run) return false;
  try {
    await run("reveal_in_folder", { path });
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------- 剪贴板 -------------------------------- */

/**
 * 复制文本。
 *
 * WebKit 下 `navigator.clipboard` 可能不存在或 reject（无焦点、非安全上下文），
 * 原实现直接 `await` 不 catch，结果就是**按钮毫无反应也没有报错**。
 * 这里先走异步 API，失败退回 execCommand。
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* 落到下面的降级路径 */
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "-1000px";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}
