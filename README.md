# 班主任 AI 工作台

**班里大小事，一个工作台。**

这是一个 Local First 的高职 / 大专班主任、辅导员个人工作台。学校学工系统负责正式审批、上报和统一留痕；本工作台负责日常过程管理、本地归档和材料整理。

## 核心能力

- 班级看板
- 学生库
- 特殊关爱学生
- 事件管理
- 待办
- 谈心谈话
- 评奖评优 / 奖助
- 升学就业
- 材料输出
- AI Privacy Gateway

## 数据与隐私

- 学生原始资料、身份映射和业务记录默认保存在当前浏览器的 IndexedDB。
- 不需要账户、后端数据库或云同步，主要功能可离线使用。
- 本地页面允许教师查看完整资料。
- 只有教师主动使用 AI 辅助时，内容才进入“最小必要 → 去标识化 → 人工确认”流程。
- 工作台不自动调用第三方 AI，也不通过 URL 携带学生材料；教师手工复制已确认的 Prompt，粘贴返回后在本机恢复身份并再次审核。

## 正式入口

- 工作台：`/workbench`
- 100 人虚构演示：`/workbench?mode=demo`
- 根路径 `/` 也直接进入工作台。

## 本地运行

要求 Node.js 22.13 或更高版本。

```sh
npm install
npm run dev
```

开发服务器只绑定 `127.0.0.1`。生产构建与预览：

```sh
npm run build
npm run preview
```

## 桌面端打包

Tauri 2 工程在 `src-tauri/`。需要 Rust 工具链与 Xcode Command Line Tools。

```sh
npm run desktop:dmg           # macOS：构建 + 打包（本机架构）
npm run desktop:dmg:univ      # macOS：Intel + Apple Silicon 合一
npm run desktop:win           # Windows：在 macOS / Linux 上交叉编译出 setup.exe
npm run desktop:build:win     # Windows：在 Windows 本机上打包
npm run desktop:dmg:only      # macOS：跳过构建，用已有 .app 直接打包
```

产物统一落在 `dist-desktop/`。

### 桌面端为什么有 `src/v2/desktop.ts`

打包成 App 后，页面跑在 `tauri://localhost` 自定义协议里，浏览器的三件事会失效：

- `<a download>` 下载 —— WebView 没注册下载代理，点击被静默丢弃；
- `target="_blank"` 开新窗口 —— WebView 默认不注册新窗口处理器，点击被静默丢弃
  （这是「学工系统按钮点了不跳转」的原因）；
- `navigator.clipboard` —— 自定义协议不一定是安全上下文，部分 WebKit 版本直接取不到。

所以导出文件、外链、复制统一走 `desktop.ts`：桌面端调用 `src-tauri/src/lib.rs` 里的
`save_export_file`（写入系统「下载」目录，重名自动加序号）/ `open_external`（只放行
http/https）/ `reveal_in_folder`，浏览器端原样退回 Blob 下载与 `window.open`。
打包时设 `VITE_DESKTOP_DIAG=1` 会叠加一个能力自检面板（`DesktopDiag`），便于真机确认。

### macOS：为什么不用 `tauri build --bundles dmg`

Tauri 内置的 `bundle_dmg.sh` 在新版 macOS 上会因一个未转义的正则失败（`grep: bad regex ... brackets not balanced`），
且失败时不卸载临时镜像，会在 `/Volumes` 留下残留、连累下一次构建。所以 `scripts/package-dmg.sh`
只让 Tauri 产出 `.app`，dmg 由脚本自己拼。细节见该脚本顶部注释。

打 universal 包前需要 `rustup target add x86_64-apple-darwin`。

### Windows：在 macOS 上交叉编译

Tauri 官方要求 Windows 包在 Windows 上打，但用 `cargo-xwin` 可以在 macOS / Linux 上走 MSVC 目标交叉编译，
省掉一台装 Visual Studio 的机器。`scripts/package-nsis.sh` 已固化整条链路，前置条件它会自己检查：

```sh
rustup target add x86_64-pc-windows-msvc
cargo install cargo-xwin --locked
brew install llvm makensis
```

两个版本按需选择：默认沿用 `tauri.conf.json` 的 `offlineInstaller`（把 WebView2 离线包打进安装程序，
断网也能装，成品 200 MB 量级）；加 `--small` 改用 `downloadBootstrapper`（安装时联网下载 WebView2，
成品几 MB）。`npm run desktop:win -- --small` 即可。

也可以推到 GitHub，用 [.github/workflows/desktop.yml](./.github/workflows/desktop.yml) 的 Actions 直接出双平台产物。

## 测试

```sh
npm test
npm run test:browser
npm run test:browser:webkit
npm audit
```

使用方法见 [docs/USER_GUIDE.md](./docs/USER_GUIDE.md)（使用文档）。维护前请先阅读 [AGENTS.md](./AGENTS.md)、[PRD.md](./PRD.md) 和 [docs/HANDOFF.md](./docs/HANDOFF.md)。历史迁移资料统一保存在 `docs/archive/v1/`，不作为当前需求来源。

## License

[MIT](./LICENSE) —— 欢迎班主任老师们自由使用、修改与分发。
