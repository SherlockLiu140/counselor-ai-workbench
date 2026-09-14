# 班主任 AI 工作台｜当前进度

更新日期：2026-09-14

## 正式状态

- 唯一正式入口：`/workbench`
- 根路径：`/`，直接进入工作台
- 100 人虚构演示：`/workbench?mode=demo`
- 旧版本页面、版本切换和汇报入口已下线。

## 已完成能力

- Local First 班级看板、学生库和完整本地学生档案。
- 特殊关爱学生 KPI、目录、多条件筛选、多重关注和学生事务联动。
- 事件、待办、谈心谈话、跟进与结案的可追溯业务链。
- 成绩、排名、考勤与谈话时间线可视化。
- 评奖评优 / 奖助、升学就业和材料输出。
- CSV / XLSX 花名册导入，以及 TXT、CSV、XLSX、DOCX、可提取文本 PDF 的本地解析。
- IndexedDB 本地持久化、稳定 S 代号、完整 JSON 备份和 100 人虚构演示空间。
- AI Privacy Gateway：最小必要、去标识化、人工确认、手工复制、返回内容本地恢复身份和再次审核。
- PWA 构建和本地静态资源缓存；运行时不使用 CDN、遥测或第三方数据接口。

## 清理与迁移

- 清理前 Git 基线：`5812068`。
- 清理前仓库外备份：`班主任AI工作台-pre-v1-cleanup-20260911.tar.gz`。
- 旧页面、旧工作流 UI、本地分析 UI、汇报源码、汇报构建脚本和专属测试已删除。
- 历史需求、任务、进度、使用说明、截图和审计文件已归档到 `docs/archive/v1/`。
- 正式文档统一为 `AGENTS.md`、`PRD.md`、`TASKS.md`、`docs/PROGRESS.md` 和 `docs/HANDOFF.md`。
- 保留旧 IndexedDB 空间读取和稳定映射兼容层，用于首次迁移已有本地数据；该兼容层没有用户入口。

## 隐私数据流

```text
本地文件
→ 浏览器本地解析
→ IndexedDB 学生 / 事件 / 待办 / 谈话档案
→ 本地模板成文
→ 教师主动使用 AI
→ 最小必要 / 去标识化 / 人工确认
→ 直接调用已配置服务商（可选）/ 手工复制 Prompt 粘贴返回
→ 本地恢复身份 / 人工审核
→ 本地归档或复制到学工系统
```

## 2026-09-11 最终质量检查

- 单元测试：7 个测试文件、101 项测试全部通过；包含 100 人扩展花名册按表头映射导入、完整字段保留、特殊关爱聚合、多重关注、敏感字段隔离和旧 IndexedDB 数据迁移快照。
- Chromium：8 个正式业务流程全部通过。
- WebKit：8 个正式业务流程全部通过。
- 生产构建：TypeScript 与 Vite 构建成功，PWA 生成成功。PDF.js、XLSX 和 DOCX 解析包仍有构建体积提示，不影响功能。
- 依赖审计：`npm audit` 报告 0 个漏洞。
- 网络与控制台：浏览器回归期间无控制台错误、无非 GET 请求、无 `127.0.0.1` 以外请求；运行时代码未发现 `fetch`、XHR、Beacon、WebSocket、EventSource、外部字体、CDN、遥测或 Analytics。
- 源码扫描仅发现 `package.json` 中 SheetJS 的安装包地址和 SVG 命名空间。前者只在安装依赖时使用，后者不是网络请求。

## 2026-09-11 视觉与美观性优化（纯样式层）

- 范围：只调整 `src/styles.css`、`src/ui.css`、`src/v2/v2.css` 三个样式文件；**未改动任何 DOM 结构、React 组件、类名、业务逻辑与数据处理**。
- 建立统一设计标记：颜色（松绿品牌色阶、中性灰绿、琥珀、危险）、字阶、圆角、阴影与焦点环，集中在 `styles.css` 的 `:root`，其余样式统一复用，消除此前散落硬编码色值造成的“灰绿同色、层级扁平”。
- 视觉改进：统一圆角与内距节奏；面板 / 卡片改为分层低对比阴影；按钮、输入框、徽标统一形态与悬停 / 焦点状态；表格改为横向分隔线并启用等宽数字；状态与优先级标签改为胶囊形态，补全 `正常 / 实习中 / 毕业去向待确认` 与 `priority.low`；图表（柱状、横向条、折线）提升对比度与刻度可读性；弹层统一圆角与遮罩模糊；侧栏当前项增加左侧强调条。
- 响应式：新增 `≤1280px`、`≤460px` 断点，修正移动端 KPI 列数，保持 4 列 → 2 列 → 紧凑双列的自适应节奏。
- 兼容性校验：改前 508 个唯一 CSS 选择器，改后 550 个，**丢失 0 个**，净新增 42 个（仅新增，未删除或改名），保证既有类选择器（含测试使用的 `.award-card`、`.career-table`、`.comparison`、`.filter-pills`、`.privacy-gateway`）继续生效。
- 验证结果：单元测试 7 个文件 / 101 项全部通过；Chromium 8 条正式流程通过；WebKit 8 条正式流程通过；生产构建 `tsc -b && vite build` 成功，PWA 生成成功。
- 响应式实测：1440 / 1180 / 390 三档宽度截图均无横向溢出。
- 边界确认：未触碰 Local First 与 Privacy Gateway；未新增网络请求、依赖、后端或运行时能力。

## 2026-09-12 首页时钟与今日待办清单小看板（增量功能）

- 需求：进入首页即可看到当前时间 / 日期 / 星期，以及「今天要做什么、今天要跟谁谈话」的待办清单。
- 新增组件 `src/v2/TodayBoard.tsx`，放在首页页头下方、KPI 之上，桌面端为「时钟 + 清单」双栏，`≤1100px` 收为单栏。
- 时钟：本地 `Date` 每秒刷新，显示 `时:分:秒`、`YYYY 年 M 月 D 日`、星期与按时段变化的问候语；使用 `<time dateTime>` 语义标签与等宽数字。**时钟单独成组件，每秒状态更新只重渲染时钟本身**，不触发清单与看板的 diff。
- 今日清单口径：新增纯函数 `todayAgenda(space, today)`（`src/v2/selectors.ts`），只收「已逾期、今天到期、待谈话」三类未完成待办，按截止时间再按优先级排序，最多展示 5 条，其余折叠为「还有 N 项」；顶部胶囊显示三类计数。
- 清单可直接勾选完成，复用既有 `completeTask`（含事件与学生在没有剩余待办时同步收尾的既有逻辑），并沿用首页通知条反馈；点击事项行进入学生工作台，点击计数胶囊进入待办中心 / 谈心谈话。
- 口径边界：**未来到期事项刻意不进入今日清单**，避免与既有「今天先做什么」面板（全部待处理前 5 条）重复。已加单测固定该边界。
- 演示数据：`createDemoV2Space` 补充 8 条虚构待办（2 条已逾期、3 条今天到期、2 条待谈话、1 条待回访、1 条待复查，其中 1 条未来到期），使演示空间下看板内容可见；全部为虚构数据，不含任何真实学生资料。
- 测试补充：`tests/metrics.test.ts` 新增 3 项 `todayAgenda` 单测（分类与排序、未来事项排除、空数据）；新增 `tests/browser/today-board.spec.ts` 3 条流程（时钟与清单渲染、勾选完成后计数同步、胶囊跳转谈话中心）。
- 既有流程断言收紧：演示空间新增待办后，`tests/browser/workbench.spec.ts` 的「开始谈话」「完成复查」与 `tests/browser/business.spec.ts` 场景 5 的「完成复查」不再唯一（`.task-row` 数量增加）。这三处由全页面角色定位改为按任务行定位（`.task-row` + 任务标题），保持原意且去掉「演示空间没有待办」这一隐含假设；不是放宽断言。
- 兼容性校验：改前 508 个唯一 CSS 选择器，改后 596 个，**丢失 0 个**，净新增 88 个（其中 `.today-*` 39 个）。
- 验证结果：单元测试 7 个文件 / 104 项全部通过；Chromium 11 条流程全部通过；WebKit 11 条流程全部通过；生产构建成功，PWA 生成成功。
- 响应式实测：1440 / 1180 / 900 / 390 四档宽度截图**均无横向溢出**；`≤760px` 时看板由双栏收为单栏，时钟卡贴合内容高度。
- 边界确认：未触碰 Local First 与 Privacy Gateway；时钟与清单均基于本机数据与本地时间，无新增后端、网络请求、依赖或运行时能力。

## 2026-09-13 视觉语言改造：Nothing Design Language（浅色单色版）

- 范围：`src/styles.css` 设计标记层、`src/ui.css` 与 `src/v2/v2.css` 取值层、新增本地字体 `public/fonts/doto.woff2`、`public/icon.svg`。**未改动任何 DOM 结构、React 组件、类名或业务逻辑**。
- 骨架改为纯单色：`ink #000` / `muted #585A5A` / `canvas #F5F5F5` / `surface #FFF`；原松绿品牌色阶整体迁移为明度阶梯，全站不再出现品牌彩色。
- 层级改由 1px 发丝线（`#E5E7EB`）承担：阴影标记统一置为 `none`，浮层只留一圈 1px 分离环，顶栏与弹层遮罩去掉 `backdrop-filter`；图表去掉 `linear-gradient` 改单色实心；`.care-table` 固定列投影改 1px 发丝线。
- 字体改为三层：新增本地打包的 Doto 点阵字体（SIL OFL 授权，5.4KB）只用于时钟、KPI 数值与计数；`.eyebrow`／`.v2-page-title span`／`.today-clock-label`／`.card-tag` 改用等宽字距；正文仍为无衬线。
- 信号红 `#D71921` 只出现在「需要注意」处：待谈话与已逾期胶囊的指示点、优先级 high、逾期状态。
- 语义色保留并降饱和：`待关注 / 待谈话` 青铜、`跟进中 / 实习中` 石板灰蓝、`正常` 中性灰、`毕业去向待确认` 白底灰描边；优先级 low 中性、medium 青铜、high 信号红。圆角收敛为 4 / 6 / 8 / 12 / 胶囊。
- 品牌图标 `public/icon.svg` 由松绿 `#256350` 改为纯黑（该文件同时用于 favicon、PWA 图标与侧栏 logo），与单色系统一致。
- 兼容性校验：改前 508 个唯一 CSS 选择器，改后 596 个，**丢失 0 个**；覆盖层的取值均已归位到各自规则内，未留下重复定义。
- 验证结果：单元测试 7 个文件 / 104 项全部通过；Chromium 11 条流程通过；WebKit 11 条流程通过；生产构建成功，PWA 生成成功，`dist/fonts/doto.woff2` 正确产出。
- 响应式实测：1512 / 1180 / 390 三档宽度 × 首页 / 我的班级 / 特殊关爱 / 待办 / 评奖评优 / 学生工作台六个页面，**均无横向溢出**。
- 边界确认：未触碰 Local First 与 Privacy Gateway；字体为本地静态资源，`font-src 'self'` 命中既有 CSP，无新增依赖、无网络请求、无 CDN、无遥测。

## 2026-09-13 首页时钟列补位：今日推进 / 本周节奏 / 接下来（增量功能）

- 背景：首页时钟卡下方的左列有 296 × 310px 空白——右侧清单高 546px，时钟卡只有 236px，且 `.today-clock` 带 `align-self: start` 不参与拉伸。
- 结构变化：`.today-board` 的两个直接子元素由「时钟 + 清单」改为「`.today-rail`（时钟 + 节奏面板）+ 清单」，使左列可与右侧等高。`.today-clock` 移除 `align-self: start`（在纵向 flex 列里该属性会把它压成收缩宽度）。
- 新增口径（`src/v2/selectors.ts` 纯函数，均可单测）
  - `todayProgress`「今日推进」：今天到期 / 已逾期 / 待谈话三类中已完成与未完成各多少。已完成项按 `completedAt` 归入当天，因此**勾选时分子 +1、分母不变**，进度条不会回跳；昨天完成、未来到期与无到期的非谈话事项都不进分母。
  - `weekRhythm`「本周节奏」：周一至周日每天的未完成事项数，今天用实心方块、有事项的日子用实心圆点。只数未完成项，所以过去的日期若仍有未办事项会留点，等同逾期提示。
  - `upcomingTasks`「接下来」：未来 7 天内到期的未完成事项。两条边界专为避免重复展示——排除「待谈话」（`todayAgenda` 已把全部待谈话含未来到期列入今日清单）、限定 7 天窗口（更远的事项由下方「今天先做什么」承担）。
- 视觉：推进读数走点阵字体 Doto；三块标签沿用等宽字距微标签（与「现在」一致）；进度条为分段式，≤12 项时一项一段、超过则按比例折算为 12 段；空态圆点降到 `--line-soft` 以免噪。
- 响应式：≤760px 左列转为两列栅格（时钟 | 节奏面板），≤460px 回落为单列并同步收紧内距。
- 测试补充：`tests/metrics.test.ts` 新增 6 项（推进分子分母稳定性、只算当天完成、本周按周一起算、接下来排序与边界、7 天窗口、空数据）；`tests/browser/today-board.spec.ts` 新增 3 条流程（三块渲染与计数、勾选后进度条前进且总数不变、接下来可跳转学生工作台）。
- 过程中修正一处真实重复：`business.spec.ts` 场景 2 生成的两周后跟进待办同时出现在「接下来」与「今天先做什么」，导致 `getByText` 严格模式匹配到 2 个元素。**未改断言**，而是把「接下来」限定为 7 天窗口从产品口径上消除重复。
- 兼容性校验：改前 508 个唯一 CSS 选择器，改后 628 个，**丢失 0 个**。
- 验证结果：单元测试 7 个文件 / 110 项全部通过（+6）；Chromium 14 条流程通过（+3）；WebKit 14 条流程通过（+3）；生产构建成功，PWA 生成成功。
- 响应式实测：1512 / 1280 / 760 / 390 四档宽度，**均无横向溢出**；桌面端左列与右侧清单等高（546px），空白由 310px 降为 23px 的呼吸余量。
- 边界确认：未触碰 Local First 与 Privacy Gateway；三块数据全部由本机 `tasks` 派生，无新增存储、无网络请求、无新依赖、无埋点。

## 2026-09-13 修复与增量：谈话入口、看板对齐与国产 AI 服务商直连

### 1. 修复：待办「开始谈话」点了没反应

- 根因：`App.tsx` 原为 `onTalk={(task) => task.eventId && setTalkEventId(task.eventId)}`，只有关联了原始事件的待办才会有反应。演示数据里三条「待谈话」待办（`task:demo-3/5/6`）**全部是无 `eventId` 的独立待办**，因此点击 100% 无效。附带发现：`completeEventConversation` 只收尾带 `eventId` 的待谈谈论办，原独立待办永远不会被收尾。
- 修法：新增 `startTaskTalk(task)`——已关联事件的待办直接打开对应谈话表单；独立待办先 `registerEvent` 建立谈话事项，再把原待办标记为「已转入谈话事项跟进」，然后打开 `TalkForm`。未关联学生的待办给出明确提示，而不是静默失败。
- 未改动 `store.ts` 的事务与迁移逻辑，只调用既有 `registerEvent` / `completeTask`。

### 2. 视觉修正

- 移除 `.today-clock` 的 `border-top: 3px solid var(--brand-500)`（Nothing 单色版下即 3px 纯黑粗边）。实测现为 `.panel` 统一发丝线 `1px rgb(229, 231, 235)`，`box-shadow: none`。
- `.today-rhythm` 增加 `flex: 1`，让左列吸收栅格余量。实测 1440px 下 `.today-rail` 与 `.today-list` 均为 `top 217 / bottom 763 / height 546`，**底边差 0px**；时钟固定 236px，节奏面板由 292px 撑满。

### 3. 增量：国产 AI 服务商预设与直连调用

- 新增 `src/v2/providers.ts`（纯配置与网络层）与 `src/v2/AiSettingsPane.tsx`（设置页），侧边栏新增「AI 设置」入口。填 Key 即可用，模型预选且可下拉选择或直接手填。
  - DeepSeek：`deepseek-v4-flash`（默认）/ `deepseek-v4-pro`
  - Kimi：`kimi-k3`（默认）/ `kimi-k2.7-code` / `kimi-k2.6` / `moonshot-v1-128k`
  - 智谱 GLM：`glm-5.1`（默认）/ `glm-4-flash` / `glm-4-plus`
  - 通义千问：`qwen3.5-plus`（默认）/ `qwen3-max` / `qwen-plus` / `qwen-turbo`
  - 豆包：`doubao-seed-2.0-pro`（默认）/ `doubao-seed-2.0-lite`
- **不预设已停用的模型名**：`deepseek-chat` 与 `deepseek-reasoner` 已于 2026-07-24 停用，`kimi-k2` 系列已于 2026-05-25 下线；单测加入守卫断言，防止后续回退到这些名字。
- 模型名迭代快，因此除预设外提供「拉取模型列表」（走 OpenAI 兼容 `GET /models`，不消耗额度）；豆包（火山方舟）不提供该接口，降级为手填并在卡片内说明。
- 连通性实测：五家 `POST /chat/completions` 与四家 `GET /models` 的 CORS 预检均放行 `127.0.0.1` 来源，浏览器可直连，**无需后端或 Tauri 代理**。
- Privacy Gateway 集成：在「复制已确认 Prompt」旁新增「直接调用 <服务商>」，仅当已配置 Key 时出现；未配置时显示「配置 AI 服务商 →」跳转设置页。
- **合规边界（关键）**：调用只发送 `payload`（已人工确认的去标识化内容），本地原文 `source` 永不外发；流程仍是「最小必要 → 去标识化 → 人工确认 → AI → 本地恢复身份 → 人工审核」。不填 Key 时保持原有复制粘贴流程，离线可用性不变。
- Key 存放于独立 localStorage 键 `counselor-ai-providers`，**不写入 V2Space**，因此不随本地 JSON 备份导出，也不触发 IndexedDB 迁移。

### 验证

- 单元测试：8 个文件 / **119 项**通过（新增 `tests/providers.test.ts` 9 项）。
- Chromium：**21 条**流程通过（新增 `ai-settings.spec.ts` 4 条、`task-talk.spec.ts` 3 条）。
- WebKit：**21 条**流程通过。
- 生产构建成功，PWA 正常生成。
- CSS 选择器：改前 628 → 改后 **652**，**丢失 0 个**。
- 响应式：1512 / 1280 / 760 / 390 四档宽度首页**均无横向溢出**。
- 截图归档：`.workbuddy/ui-review/2026-09-13-ai/`。
- 边界确认：`business.spec.ts` 的 Local First 守卫（断言无任何非 GET 请求、且请求只发往 127.0.0.1）仍全部通过——设置页与网关默认不发请求，只有教师显式点击「测试连接 / 拉取模型列表 / 直接调用」才会联网。

## 2026-09-13 补：顶栏与卡片对齐修正

### 问题（教师实测反馈）

1. **顶栏两个动作按钮尺寸不统一**：`＋ 登记一件事` 实测 101×35（12px 字号），`退出演示` 实测 84×40（14px 字号），一高一矮且上下边错位。根因：`.v2-top-actions button` 只命中 `<button>`，而后者是 `<a class="button">`，未被命中。
2. **顶栏内容与正文卡片网格左右不对齐**：`.v2-topbar` 左右内边距 32px，`.v2-main` 为 36px，顶栏标题与按钮比下方卡片网格左右各外扩 4px。
3. 连带发现两处行列不齐：`.care-kpi` 的 `border-top: 3px` 使 KPI 第一行比其它行高 2px；`.v2-dashboard-grid` 间隙 18px 与 `.v2-kpis` 的 14px 不一致，下方图表面板比 KPI 列窄 2px。

### 改动（全部在 `src/v2/v2.css`，零 DOM 改动）

- `.v2-top-actions button` 选择器扩展为 `… button, … .button`，统一 `font-size: 13px / line-height: 20px / padding: 8px 14px`；两个按钮现在同为 38px 高，top 15.5 / bottom 53.5 完全对齐。
- `.v2-topbar` 引入 `--topbar-pad-x`，与 `.v2-main` 各断点同值（默认 36 / ≤1280 为 26 / ≥1600 为 52 / ≤760 为 16），并用 `max(var(--topbar-pad-x), calc((100% - 1500px) / 2 + var(--topbar-pad-x)))` 兼容 `.v2-main` 因 `max-width: 1500px` 在超宽屏居中的情形。
- `.v2-kpis .care-kpi` 的顶部强调条由 `border-top: 3px` 改为 `box-shadow: inset 0 3px 0 var(--amber-500)`，不参与盒模型，行高统一。**注意**：本主题 `--sh-*` 的值是 `none`，不能与 inset 写进同一阴影列表（`inset …, none` 属非法值，整条声明会失效并回落到 `none`）——首版即踩到这个坑，已由新增测试兜住。
- `.v2-dashboard-grid` 间隙 18px → 14px（≤1280 为 12px），与 KPI 网格同间距，图表面板左右边界与 KPI 第 2 / 第 3 列重合。

### 验证

- 单元测试：8 个文件 / **119 项**通过。
- Chromium：**24 条**通过（新增 `tests/browser/alignment.spec.ts` 3 条：按钮同尺寸同上下边、顶栏与正文左右对齐、KPI 行高统一且与图表面板同列）。
- WebKit：**24 条**通过。
- 生产构建成功，PWA 正常生成。
- CSS 选择器：652 → **656**，**丢失 0 个**（新增 `.v2-top-actions .button` 与 ≤1280 下的 `.v2-dashboard-grid`）。
- 实测几何：1469 / 1920 / 1760 / 1512 / 1280 / 1100 / 760 / 390 八档，顶栏内容右边缘与正文右边缘**差 0px**；顶栏与正文左右内边距在各断点**逐档一致**；KPI 同行卡片高度集合恒为单一值（≥1600 为 122，≤460 为 109.6）；**八档均无横向溢出**。
- 边界确认：未触碰 Local First 与 Privacy Gateway，无新增请求、无数据模型改动。
- 截图归档：`.workbuddy/ui-review/2026-09-13-align/`。

## 2026-09-13 补：今日看板与 KPI 网格接缝对齐

### 问题

今日看板的竖向接缝（待办清单左边缘）与下方 KPI 网格第二列错开：1450 宽视口下看板接缝落在 588px，而 KPI 第二列从 562.5px 起，**相差 25.5px**；看板左列本身也比 KPI 第一列宽 21.5px。

### 原因

`.today-board` 用 `minmax(0, 296px) minmax(0, 1fr)`（左列固定 296px）且 `gap: 18px`；而 `.v2-kpis` 是 `repeat(4, minmax(0, 1fr))` + `gap: 14px`。两块网格轨道定义不同，断点变化也不同步（≤1100 时 KPI 已改 2 列，看板仍是 296px + 1fr）。

### 改动（仅 `src/v2/v2.css`，零 DOM 改动）

- `.today-board` 改为 `repeat(4, minmax(0, 1fr))` + `gap: 14px`，与 KPI 网格共用同一套轨道定义。
- `.today-rail { grid-column: span 1 }`、`.today-list { grid-column: span 3 }`。
- ≤1280：新增 `.today-board { gap: 12px }`，与 `.v2-kpis` 同步。
- ≤1100：新增 `.today-board { grid-template-columns: repeat(2, minmax(0, 1fr)) }` 与 `.today-list { grid-column: span 1 }`，跟随 KPI 的 2 列变化。
- **连带回归修复**：左列由固定 296px 改为「四等分中的一轨」后，1101–1229 档左列仅约 205–237px，时钟 46px 大字会把卡片撑破（内部溢出 32px）。≤1280 将时钟字号收敛为 36px / 17px，≤1100 左列回到半宽后还原 46px / 21px。

### 验证

- 单元测试：8 个文件 / **119 项**通过。
- Chromium：**26 条**通过（`alignment.spec.ts` 新增 2 条：接缝对齐、窄档时钟与周条不溢出）。
- WebKit：**26 条**通过。
- 生产构建成功，PWA 正常生成。
- CSS 选择器：656 → **663**，**丢失 0 个**。
- 实测 14 档宽度（1920 / 1600 / 1469 / 1450 / 1281 / 1280 / 1101 / 1100 / 1024 / 900 / 761 / 760 / 460 / 390）：并排档位**接缝差均为 0px**（看板左列右边缘 == KPI 第一列右边缘，待办清单左边缘 == KPI 第二列左边缘）；页面无横向溢出；周条 / 时钟 / 接下来 / 待办行**内部溢出均为 0**。
- 边界确认：未触碰 Local First 与 Privacy Gateway，无数据模型改动。
- 截图归档：`.workbuddy/ui-review/2026-09-13-seam/`（`same-as-user.png` 为按用户截图同一取景复刻的对比图）。

## 2026-09-13 补：谈话记录可见性、逐条导出与 AI 脱敏分析

起因：老师反馈"点进谈话录入后看不到谈话内容"。实机取证后确认数据链路正常（五个字段全部入库），"看不到"来自四处叠加，本轮一并处理。

### 完成项

- **谈心谈话页**：谈话记录列表**前置到模板库之前**（原来 13 张模板卡把记录压到首屏之外，首屏一条记录都看不到），默认展示最近 5 条，超出提供「查看全部 N 条 / 只看最近 5 条」。
- **记录字段直接可见**：抽出 `ConversationFields`（谈心谈话页与个人看板共用），展示谈话日期 / 地点 / 学生主要表达 / 班主任引导 / 共识措施 / 后续跟进 / 复查日期 / **口述原始记录**。修复 `rawNotes` 在 UI 上完全不可见的缺陷——原来卡片与 `formatConversationRecord` 都优先用 `studentExpression`，一旦填了「学生主要表达」，老师真正打字的「口述原始记录」在任何页面都查不到。
- **学生个人看板**：新增 `.panel.talk-records.full-span` 独立区块，置于「基本信息」之前，按谈话日期倒序列出该生全部谈话记录，标准成文可折叠。
- **逐条导出**：新增 `src/v2/export.ts`（纯前端 Blob，不经过后端、不上传、不联网）。单条 / 单个学生 / 全部谈话记录导出为 Markdown，文件名形如 `林知禾-谈话记录-2026-09-13.md`，正文首部带保管提示。入口三处：谈心谈话页「导出全部（Markdown）」、记录卡「导出此条」、个人看板「导出该生全部 / 导出此条」。
- **逐条 AI 脱敏分析**：记录卡与个人看板新增「交给 AI 分析（脱敏）」，由 `buildConversationTalkSource` 组装最小必要材料后进入既有 AI Privacy Gateway（最小必要 → 去标识化 → 人工确认 → AI → 本地恢复身份 → 人工审核），不绕过网关、不外发本地原文。
- **修掉一个"写错记录"的隐患**：`saveGatewayResult` 原来用 `[...conversations].reverse().find(studentId)` 取该生**最新一条**并覆盖 `finalRecord`，若对历史某条做 AI 分析会误写最新那条。现改为接受 `conversationId` 精确定位，缺省时保留旧行为，旧调用不受影响。

### 验证

- 单测 **129 项**（新增 `tests/talk-records.test.ts` 10 项：排序、字段完整性、只填原始记录、AI 标注、空列表不产文件、文件名与内容、按 ID 精确写回、ID 不存在时报错且不误写）。
- Chromium **32 条**、WebKit **32 条**（新增 `tests/browser/talk-records.spec.ts` 6 条，含 Local First 守卫：无非 GET 请求、只发往 127.0.0.1）。
- 生产构建成功；CSS 选择器 **663 → 675 零丢失**（新增 12 个 `talk-*` 选择器）。
- 谈心谈话页与学生个人看板各 **10 档宽度**（1920/1469/1280/1101/1100/900/761/760/460/390）实测**零横向溢出**，卡片内部亦无溢出。
- 实机取证：记录区 top=290、记录卡 top=376（900 高视口首屏可见），模板库 top=1008；下载文件 `林知禾-谈话记录-2026-09-13.md` 内容含口述原始记录；网关识别 2 项敏感信息并分栏对照。

## 2026-09-13 补二：谈心谈话可直接发起，不再强制「先登记事件、再生成待办」

起因：老师在「谈心谈话」页点「发起一次谈心谈话」，弹出的却是「登记一件事」表单——必须先登记一条事件（并因此自动生成一条「待谈话」待办）才能开始谈话。老师判定逻辑不合理：要有事才登记，是谈话就该直接谈；谈话内容可以输出到事件登记，但不该生成待办，因为谈话当下已经处理完了。

### 根因

- `ConversationCenter` 的「发起一次谈话」直接绑到 `openNewEvent()`，于是弹「登记一件事」；提交后走 `registerEvent`，`needsConversation: true` 又顺手生成一条「待谈话」待办，再跳到「事务」页。
- `startCareTalk`（学生个人看板 / 特殊关爱目录的「发起谈话」）是同一套逻辑：先 `registerEvent` 建「特殊关爱跟进」事件并挂待谈话 + 复查两条待办，再打开谈话表单。
- 数据模型其实早就允许谈话脱离事件——`ConversationRecord.eventId` 本来就是可选字段，是入口把两者硬绑在一起了。

### 完成项

- **新增直接谈话链路**：`workflow.ts` 增加 `recordStandaloneConversation(store, input)`。谈话记录可独立存在（`eventId` 可缺省），**不生成「待谈话」待办**，默认也不生成复查待办。
- **入口改直连**：谈心谈话页「发起一次谈心谈话」、学生个人看板「发起谈话」、特殊关爱目录「发起谈话」三处全部改为直接打开新表单 `NewTalkForm`（预选学生 / 预选主题），不再经过「登记一件事」。首页「快速开始」增加「发起谈心谈话」快捷入口。
- **两个显式勾选，取代隐式副作用**：
  - 「同时在『事务』留一条记录（便于归档与材料引用）」——默认勾选。谈话本身就是处理过程，事件直接落到链路末端：**没排复查 → `已结案`**（谈完就了结，不给老师再留一个「确认结案」的仪式感点击），**排了复查 → `跟进中`**（等复查待办完成后由既有链路收口）。回填 `relatedConversationIds`，`relatedTaskIds` 为空时不挂待办（归档留痕，不是排活）。
  - 「需要复查提醒（生成待办）」——默认**不勾选**，勾选后才生成一条「待复查」待办（且必须填复查日期，否则不建空待办）。
- **成文函数解耦**：`formatConversationRecord` 的第二个参数由 `EventRecord` 收敛为 `ConversationSubject = { type, facts }`（EventRecord 结构兼容，事件谈话调用方无需改动），直接谈话用主题生成中性背景句，不臆造事实。
- **文案纠正**：谈心谈话页空态由「从『事务』或『待办』进入谈话」改为「点右上角『发起一次谈心谈话』直接记录」；个人看板空态补「谈完即归档，不会额外生成待办」。事件类型与谈话主题共用 `EVENT_TYPES` 常量，避免两处措辞漂移。
- **未改动**：从「事务」事件、「待办」发起谈话的既有链路保持不变（那里确实存在前置事项，谈完收尾那条待办是正确的）。

### 验证

- 单测 **136 项**（新增 `tests/direct-talk.test.ts` 7 项：默认零待办、绝无「待谈话」待办、勾选才建事件且没排复查即结案、勾选才建复查待办且事件转跟进中、只勾提醒不给日期不建空待办、背景留空不臆造事实、学生不存在时报错且不落库）。
- Chromium **39 条**、WebKit **39 条**（新增 `tests/browser/direct-talk.spec.ts` 7 条，含 Local First 守卫：无非 GET 请求、只发往 127.0.0.1；含「待谈话」KPI 保存前后不变、事务留痕可开关且不出现「确认结案」、复查勾选才生成待办、首页与学生看板入口）。
- 生产构建成功；本轮未改 CSS，选择器基线不动。
- 顺带修正 `tests/browser/business.spec.ts` 场景 4 的定位器：`getByRole("button", { name: /谈心谈话/ })` 因新增首页快捷入口而命中两个元素，改为收敛到 `.v2-nav`（与其余用例一致）。
- 边界确认：未触碰 Local First 与 Privacy Gateway，无数据模型迁移（`ConversationRecord.eventId` 本就可选）。

## 2026-09-13 补三：AI 直连被本页 CSP 拦死，修复「测试连接失败」的真因

### 问题（刘老师实测反馈）

在「AI 设置」里点 DeepSeek 的「测试连接」直接失败，怀疑「DeepSeek 是不是不允许浏览器直接访问」。

### 根因

**不是服务商的问题，是本项目自己的 `Content-Security-Policy` 把出口焊死了。**

`index.html` 的 meta CSP 中 `connect-src` 只写了 `'self' ws://127.0.0.1:* ws://localhost:*`，即只允许同源与本地 WebSocket。任何 `fetch("https://api.deepseek.com/...")` 都会在发出去之前被浏览器直接拒绝，抛出 `TypeError: Failed to fetch`。

上一轮「AI 服务商直连」只验证了**服务商侧的 CORS**（见上方「3. 增量」结论），漏了**自己页面侧的 CSP**——两者必须同时放行，请求才发得出去。当时那句「浏览器可直连，无需后端或 Tauri 代理」只对了一半。

对照实验（同一页面内监听 `securitypolicyviolation` 事件）：

| 目标 | fetch 结果 | CSP 违规记录 |
| --- | --- | --- |
| `https://api.openai.com`（未放行） | `TypeError` | `connect-src <- https://api.openai.com/v1/models` |
| `https://api.deepseek.com`（放行后） | 无异常 | 无 |

### 改动

1. `index.html` 与 `src-tauri/tauri.conf.json` 的 `connect-src` 逐个放行五家 API origin：`api.deepseek.com` / `api.moonshot.cn` / `open.bigmodel.cn` / `dashscope.aliyuncs.com` / `ark.cn-beijing.volces.com`。**仍是具名白名单，不含 `*` 或 `https:`**，收窄边界不放松。
2. `vite.config.ts` 的桌面端插件原来把整条 `connect-src` 覆写成 `'self'`，会让桌面版永久失去 AI 能力；改为只剥离本机 WebSocket 白名单，AI 域名保留。
3. `providers.ts` 新增 `PROVIDER_ORIGINS`、`connectSrcSources()`、`isOriginAllowedByCsp()`，并在 `testConnection` / `fetchRemoteModels` / `callChatCompletion` 发请求前执行 `assertConnectAllowed()` 自检：CSP 未放行时直接说明「是安全策略挡的、该补哪个文件」，不再让老师去猜服务商。
4. `withTimeout` 的 `TypeError` 兜底文案删去误导性的「确认该服务商是否允许浏览器直接访问」，改为提示检查网络 / 代理并查看控制台。

### 验证

- 对照实验：未放行域名仍被拦、已放行域名不再被拦。
- 端到端：填假 Key 点「测试连接」，返回的是 **DeepSeek 服务器真实回应**（`401 · Authentication Fails, Your api key: ****-key is invalid`）——请求确实发出去了，浏览器可直连，换真 Key 即通。
- 单测 **144 项**（`tests/providers.test.ts` 9 → 17，新增 8 条配置一致性守卫：两个 CSP 文件必须覆盖全部 origin、禁止通配、桌面端转换不得丢域名）。
- 生产产物 `dist/index.html` 与桌面端转换结果均已确认含全部 AI 域名。
- Chromium **40 条**、WebKit **40 条**流程通过（`ai-settings.spec.ts` 新增 1 条 CSP 放行断言）。
- 截图归档：`.workbuddy/ui-review/2026-09-13-csp-fix/`。
- 未改 CSS，选择器基线不动；未触碰 Local First 与 Privacy Gateway。

## 2026-09-13 补四：演示数据全链自洽 + 首页/列表交互 + 安全文案

目标：汇报现场点到哪里都有真实对应内容，而不是「首页写死文案」。不改数据模型、不加模块、不动 Privacy Gateway 底层。

### 1. 演示数据三条完整链（全部 ID 互相关联，`src/v2/demo.ts`）

- **林知禾｜缺勤**：班委反馈缺勤事件（`event:demo-1`，已安排谈话）↔ 待办「就缺勤与迟到情况与学生谈话」（`task:demo-3`，今天到期）→ 可进入谈话 → 跟进 → 结案；另有一条已结案的迟到历史（事件+谈话+结案结果），供材料输出复用。
- **陈晨｜国家助学金**：新增「2026 年国家助学金评选」项目 + 陈晨「待补材料」申请（缺《家庭经济困难认定表》）↔ 首页待办「核实国家助学金补交材料」↔ 评奖评优页可见 ↔ 学生详情可见，补齐材料后可继续流转。
- **周星原｜专升本**：careerPlan 方向专升本、复习计划「未制定」↔ 首页待办「跟进专升本复习计划制定情况」↔ 升学就业页「专升本未制定计划」筛选可见 ↔ 已有一次升学规划谈话，可直接再发起谈话 / 建跟进待办。
- **宋景初**：上周「日常关心」已完成谈话（含约定与跟进计划）↔ 事件跟进中 ↔ 首页「复查上周谈话约定的落实情况」今天到期，进入谈心谈话页可见这条历史记录。
- 谈心谈话页预置 **4 条**已完成谈话（日常关心 / 迟到 / 家庭困难 / 升学规划），事务中心预置 5 条事件（待谈话 ×2、跟进中、已结案 ×2），首页待办全部挂到真实事件 / 谈话 / 申请上。

### 2. 首页与列表交互

- **KPI 卡片整卡可点**（原已可点，本轮细化跳转目标）：特殊关爱→关爱目录；待谈话→待办中心并预选类型；挂科学生→我的班级「挂科学生」筛选（新增学业状态下拉）；学业异常→同上；专升本→升学就业「专升本方向」筛选（`careerFilter` 新增 `upgrade` 分支）；就业方向未明确→「方向未明确」；超期待办→待办「超期」范围；其余不变。重复的「查看依据 →」改为 hover / 聚焦时右下角浮现的小箭头，暖色 care-kpi 强调保留。
- **学生总表整行可点**：行 hover 轻微高亮 + pointer，右侧「打开工作台 →」平时 0.35 透明度弱化、hover / 键盘聚焦时浮现（opacity 实现，不影响辅助技术与既有测试定位）；键盘仍走按钮聚焦。checkbox 等独立控件不受整行点击误触（表格中无此类控件）。
- **近 7 天考勤变化**日期动态化：原来是写死的 `09-04`~`09-10`，现在取真实近 7 天并聚合当天数据。

### 3. Demo 数据分布自然化（只改 demo，不改逻辑）

- 挂科分布 **87 / 9 / 4**（原 97/3/0），挂科名单分布在两个班；另 2 人「上次→最近」成绩下滑，构成学业异常的另一来源。
- 毕业方向按配额展开后做确定性交错（步长 37 与 100 互质）：就业 38、专升本 31、考公考编 12、未明确 16、其他 2、创业 1，总数恒 100、分布交错不平均。
- 考勤记录改为相对当天的最近 7 天、每天 2–7 条刻意不均匀分布（原为 09-01~09-10 固定旧日期）。

### 4. 安全文案校正（Local First · AI Optional）

- AI 设置页副标题改为「本地优先，AI 按需使用」，说明改为四条准确表述（档案默认本地、Key 仅本机、AI 可选且须先经 Gateway 最小必要+去标识化+人工确认、AI 返回人工审核后才保存）。
- 删除绝对化措辞：「本地原文永不外发」→「本地原文不进入 AI 输入」（Privacy Gateway、AI 设置页）；材料输出页「本地模式不调用 AI」（与事实矛盾）→「材料生成在本地完成，不依赖网络；AI 优化先经 Privacy Gateway」；事件登记页「不会上传学生信息」→「AI 属于可选项，且只在 Privacy Gateway 确认后按需使用」。
- 特殊关爱导航图标 ♡ → ⚑（更贴近「重点标记」，仍为字符体系，未引入图标库）。

### 验证

- 单测 **169 项**（新增 `tests/demo-consistency.test.ts` 25 项：三条链完整性、待办可追溯、分布口径 87/9/4、材料可从既有记录生成、KPI 与底层一致、两次构造相互独立）。
- Chromium **48 条**、WebKit **48 条**（新增 `tests/browser/demo-consistency.spec.ts` 8 条：KPI 四类跳转、整行点击、谈心谈话不空、宋景初材料生成、正式入口不受 demo 影响；含 Local First 网络守卫）。
- 既有用例适配演示数据（产品行为未变）：谈话计数「共 1 条」→「共 5 条 / 2 条」、事务进度条与「记录本次谈话 / 林知禾 →」收敛 `first()`（demo 预置多条后按钮不再唯一）、direct-talk 留痕用例改与预置事件数对比、留痕主题改为「宿舍问题」避免与预置事件撞名。
- 生产构建通过；控制台零错误（截图脚本监听验证）；CSS 选择器基线 **508 → 681，丢失 0**。
- 边界确认：正式入口 `/workbench` 不加载演示数据（有测试守卫）；demo 使用独立 `V2MemoryStore`，不触碰 IndexedDB。
- 截图归档：`.workbuddy/ui-review/2026-09-13-demo/`。

## 2026-09-13 补五：AI 设置页极简化 + Agens 免费服务商

### 改动动机（刘老师反馈）

- AI 设置页之前是 5 张服务商卡片网格，每张卡片都重复展示 Key / 模型 / 测试连接，操作重复且视觉杂乱。多数老师只想填一个 Key，不希望被五张卡片劝退。
- 主流国产模型 API 都已付费；Agens AI（Sapiens AI 出品）官宣全模态 API 无限期免费，文本 `Agnes-2.5-Pro-Beta`、`Agnes-2.0-Flash` 都在 Artificial Analysis 榜单前列——多数不愿花钱的老师可以直接用。

### 改动

**1. 新供应商 Agens 加入 `PROVIDERS`**

- `baseUrl`：`https://apihub.agnes-ai.com/v1`（OpenAI 兼容 Chat Completions）；`supportsModelList: true`；预设两个文本模型，附 caution 提示模型名迭代快时点「拉取模型列表」取最新 ID。
- CSP connect-src 同步新增 `https://apihub.agnes-ai.com`（index.html 与 tauri.conf.json 一致），`PROVIDER_ORIGINS` 自动包含，新增的 `tests/providers.test.ts` 守卫会保证未来不会再漏放行。

**2. AI 设置页改为单一配置面板**（`src/v2/AiSettingsPane.tsx`）

- 顶部一个「服务商」下拉，单列布局（max-width 560）。
- 选定服务商后，下面依次展示：预设 URL（只读 code 块，老师看不到乱填空间）+ API Key 输入 + 模型下拉（含「自定义模型…」选项，可切手填文本框，「从列表选」可切回下拉）+ 测试连接 / 拉取模型列表 / 获取 Key 三个动作。
- 「模型」默认预选该服务商 `preset.models[0].id`，不再依赖用户手选模型才能用。
- Key 填好后右上角显示「当前生效」，自动绑定为 `activeProvider`（不再有「使用此服务商」按钮这一步）。

**3. 删除冗余样式**

- `v2.css` 中 `.ai-provider-grid`、`.ai-provider*`、`.ai-model-chips*`、`.ai-settings-status*` 已无引用，整段删除；新增 `.ai-config`、`.ai-config-head`、`.ai-config-active`、`.ai-field-readonly`、`.ai-config-actions`。
- 改 UI 文案前先 grep 测试里的模糊正则：旧的 `getByRole("button", { name: /DeepSeek/ })`、`{ hasText: "智谱 GLM" }` 类定位器全部失效，本次已按新结构（`getByLabel("服务商")` / `getByLabel("模型")`）改写。

### 验证

- 单测 **169**（`tests/providers.test.ts` 从 17 → 19：六家供应商枚举 + Agens origin 加入 `PROVIDER_ORIGINS` 列表；其他不变）。
- Chromium **50**、WebKit **50**（`tests/browser/ai-settings.spec.ts` 由 5 条扩到 7 条：默认单选择器展示 / 切服务商带出 Agens / 模型下拉与自定义手填 / 测试连接被 `page.route` 拦截后展示可读反馈 / 网关引导 / 直接调用 / CSP 全放行）。
- 构建通过；控制台零错误；CSS 选择器基线 508→677，丢失 0；1440 视口横向溢出 0。
- 实机截图归档：`.workbuddy/ui-review/2026-09-13-ai-simplify/`（默认、Agens、自定义模型、填 Key 四态）。

### 已知风险与说明

- Agens 官宣免费是「API 无限期免费」，但产品迭代很快，预设模型名仅作初始建议；若报 404，老师点「拉取模型列表」即可自动同步到下拉选项。
- 「服务商」下拉的切换是「立即生效」——但因为必须填 Key 才会有真实网络请求，且每次发请求都经过 Privacy Gateway 人工确认，**误选服务商不会产生任何外发**。安全文案「不填 Key 时核心工作台照常使用」依旧成立。

## 2026-09-13 补六：AI 谈话成文 Prompt 分层重构，从「简单润色」升级为「完整可用的工作记录」

### 改动动机

AI 生成的谈话记录过于简单，常只是把口述换一种说法，内容偏短、层次不足、像摘要，不像能直接粘贴进学工系统的正式记录。本轮不改产品定位、不改 Privacy Gateway、不新增模块，只把「AI 润色 / 成文」的 Prompt 体系分层并提升生成质量。

### 最高原则：可以扩写表达，不能扩写事实

AI 只能整理已提供的事实，不虚构学生原话、时间、地点、家庭成员、病史、诊断；不贴标签、不夸大、不写「深刻认识到」等空套话；原始信息不足时只做合理整理，不做事实补全。

### Prompt 体系重构（四层分离，新建 `src/v2/prompt.ts`）

原先只有一条扁平 `prompt`（`PrivacyGateway.tsx` 内联），规则与用户内容混在一起。现拆为四层纯函数：

1. **System Prompt**（`buildSystemPrompt`）：事实边界、安全原则、写作原则、禁止套话、五段输出目标（谈话背景 / 学生情况与反馈 / 班主任沟通与引导 / 当前结果或后续关注 / 后续跟进安排）。
2. **Scenario Prompt**（`SCENARIOS` 14 个场景 + `buildScenarioPrompt` + `matchScenario`）：每个场景独立的关注重点（focus）与避免项（avoid），14 个场景全部单独定义，不共用一套指令。
3. **Personal Style Prompt**（`buildPersonalStylePrompt`）：从 `ConversationTemplate` 生成，把语气（正式/自然/简洁）、人称、目标字数、常用开头/结尾、突出学生表达/引导/跟进、自定义规则逐项落地；只决定「怎么写」，不覆盖「不虚构事实」的底线。
4. **User Content**：仍由 Privacy Gateway 在去标识化 + 人工确认后拼入，只放必要事实。

14 个场景：新生首次谈话、日常关心、缺勤/迟到、挂科/成绩下降、情感问题、家庭困难、宿舍/人际矛盾、心理状态关注、违纪、奖助学金、实习异常、就业迷茫、专升本、毕业前谈话。

### 接入方式（不改 Privacy Gateway 数据流）

- `PrivacyGateway` 新增可选 prop `scenario` / `templateId`；`talk` 用途改用四层 `buildTalkPromptPrefix`，`award` / `career` / `material` 用途保持原有简短指令不变。
- `buildMinimumTalkSource` 补「谈话主题」行（`conversation.scenario ?? event.type`），使场景可从源文本稳定解析。
- `App.tsx` 的 `GatewayRequest` 新增 `scenario` / `templateId`，`analyzeConversation`（单条记录分析）传入该条记录的 `scenario` 与 `templateId`。
- 个人模板字段（tone/person/defaultLength/highlight* 等）此前只被「本地模板成文」使用，现在真正进入 AI 成文的 Personal Style 层。

### 测试补充（`tests/prompt.test.ts`，19 项）

覆盖需求要求：System Prompt 事实边界与禁止套话、14 场景完整性、场景映射正确性、情感问题禁医学判断、挂科/缺勤/家庭困难/专升本/就业/心理状态等场景重点、个人模板语气/人称/字数/简洁不短到两三句/突出项/自定义开头结尾生效、个人模板不覆盖事实边界、四层组装不含用户事实、场景主题解析。不依赖「完全相同全文」。

### 验证

- 单测 **188 项**通过（新增 19 项；`business.test.ts` / `workbench.test.ts` 对 `buildMinimumTalkSource` 的既有断言不受影响）。
- Chromium **50 条**、WebKit **50 条**全部通过（新增 prompt 为纯函数，不引入新 DOM；未新增浏览器用例）。
- 生产构建 `tsc -b && vite build` 成功，PWA 正常生成。
- 边界确认：未触碰 Local First、Privacy Gateway 数据流、`store.ts` 迁移、事件/待办/谈话关联；新增 `prompt.ts` 为纯指令层，不接触学生原始数据，不发网络请求。

## 2026-09-13 补七：查清 AI Prompt 失效真因 + 材料生成重构为分步流程

### 起因

上一轮声称完成 Prompt 分层，但老师实测「生成结果与修改前几乎没有区别，仍然是很短的摘要式文本」。**上一轮不能视为真正完成**。本轮先用假 Key + Playwright 请求拦截做了一次真实链路取证（脚本 `.workbuddy/memory/tools/trace-ai-prompt.mjs`），直接看模型真正收到的 request body。

### 第一部分：Prompt 为什么没生效（5 个真因，逐条取证）

| # | 真因 | 取证证据 |
| --- | --- | --- |
| ① | **`max_tokens` 根本没传** | request body 里 `max_tokens: undefined`，输出长度全交给服务商默认值 |
| ② | **Few-shot 完全没接入** | 10 组示例一个都没进 prompt（上一轮只当「质量参考」写在注释里） |
| ③ | **没有最终输出指令** | prompt 末尾就是 payload，没有「300～500 字」「不要压缩成摘要」的长度锚点 |
| ④ | **payload 末尾旧指令冲突** | 仍写着「输出要求：只整理事实…」，语义是"整理"不是"展开成完整记录" |
| ⑤ | UI 二次截断 | **已排除**：AI 返回 314 字 → UI 展示 314 字，完全一致 |

另外默认模板的 `writingStyle` 是「简洁」，也在暗示模型写短。

### 修复

1. **新建 `src/v2/talkFewShots.ts`**：10 组「原始输入 → 高质量输出」示例，`fewShotFor(scenario)` 只取**1 个**最接近的，`buildFewShotPrompt` 渲染；无直接示例的场景返回 undefined（不硬凑）。示例里明确写了「不得照抄句式」「不得为模仿示例补充事实」。
2. **`prompt.ts` 新增 `buildFinalOutputInstruction()`**：直接输出正文、不解释过程、不列规则、不用 Markdown 标题、**目标长度约 N 中文字（跟随个人模板 `defaultLength`）**、不压缩成摘要、仍不得新增事实。
3. **`prompt.ts` 新增 `buildTalkPromptLayers()`**：返回结构化分层（system / scenario / personalStyle / fewShot / finalInstruction + 命中的场景名与示例名），既便于测试也便于调试面板逐层展示。顺序为 System → Scenario → Personal Style → Few-shot → User Content → Final Instruction。
4. **`providers.ts`**：`DEFAULT_MAX_TOKENS = 2048`、`DEFAULT_TEMPERATURE = 0.5`（原 0.3 过于保守），并显式写入 request body；可按需覆盖。
5. **payload 末尾措辞修正**：「只整理事实…」→「只使用上述已确认内容…不添加输入中没有的事实；但在这些事实允许的范围内请充分展开，整理成完整可用的谈话记录，不要压缩成摘要」。

### 顺带修掉一个真实场景误判

取证用的固定输入「张三最近分手了，吃不下饭，成绩也下降了」被判成**「挂科/成绩下降」**而非「情感问题」——因为「成绩」+「下降」= 2 票压过「分手」= 1 票。但语义上分手是原因、成绩下降是结果。修法：场景增加 `strong` **强特征词**（权重 3）与普通关键词（权重 1）加权计分，14 个场景全部补齐。已加回归测试锁住。

### 调试能力（仅 dev / demo）

- 新建 `src/v2/aiDebug.ts` + `src/v2/AiDebugPanel.tsx`，挂在 AI 设置页底部，可折叠。
- 显示需求要求的 19 项：purpose、scenario、模板 ID/名称、命中场景、System、Scenario、Personal Style、Few-shot、脱敏后 User Content、最终完整 Prompt、provider、model、temperature、max_tokens、AI 原始 response 及字符数、UI 最终文本及字符数。
- **绝不显示 API Key**；只在内存保留最近 10 条，不落 IndexedDB、不随备份导出；生产默认关闭（`isAiDebugEnabled()` 判断 DEV 或 `?mode=demo`）。

### 第二部分：材料生成重构为分步流程

新建 `src/v2/GenerationFlow.tsx`（流程页，**不占一级导航**），6 步：①选择材料 → ②确认内容 → ③隐私处理 → ④AI 成文 → ⑤人工审核 → ⑥完成。

- **步骤条**：当前高亮、已完成显示 ✓、未完成弱化；底部 sticky 操作栏（← 上一步 / 主按钮）。
- **Step 1**：材料类型 + 学生 + 数据来源（谈话 / 事件 / 跟进记录均可勾选）。**入口未指定来源时默认带入该生最近一次谈话与最近未结案事件**，做到「不要让用户重新选一次」。
- **Step 2**：系统按勾选自动整理原始事实，可编辑 / 删除 / 补充；标明「这些内容目前仍只保存在本机」。
- **Step 3**：Privacy Gateway 正式 UI 融入流程（左右对照 + 逐项替换明细 + 「AI 只会收到右侧内容」）。**复用 `detect` / `render` / `confirmReview`，未改脱敏算法**。
- **Step 4**：显示当前 provider/model/模板；加载态给出四段进度提示（UI 状态，不真的分四次调用）；失败时提供「重新生成 / 返回隐私检查 / 改用本地模板生成」且**不清空前面数据**。
- **Step 5**：可编辑正文，可展开查看原始记录；身份已在本机恢复（恢复不经过外部 AI）。
- **Step 6**：已保存 / 已关联谈话 / 已关联事件 / 已形成材料；复制学工系统文本、导出 TXT；如已有跟进则显示「下一次跟进」而**不重复创建待办**。
- **状态全程保留**：学生、来源、原始材料、编辑内容、脱敏结果、payload、AI 结果、人工编辑结果全部在组件顶层 state，前后切换不丢。
- **本地模板模式跳过 AI**：步骤条变为 4 步（选择 → 确认 → 审核 → 完成），不为形式强迫走 AI 流程。
- **退出防丢失**：有内容时弹「当前材料尚未完成，是否退出？」，已有 AI 结果未保存时二次确认。
- **入口统一**：谈心谈话「生成正式记录」、学生个人看板「生成正式记录」、学生详情「生成材料」、材料输出「用分步流程生成」全部走 `startGeneration(seed)` 同一套流程，只是初始数据不同。

### 验证

- 单测 **199 项**（`tests/prompt.test.ts` 19 → 30，新增 Few-shot 接入/一一对应/不一次全发、最终指令、max_tokens、场景强特征词回归）。
- Chromium **56 条**、WebKit **56 条**（新增 `tests/browser/generation-flow.spec.ts` 6 条：进入 Wizard 并自动带入、Step1→Step2 往返状态保留、**AI 只收到去标识化 payload（断言 body 不含「林知禾」且含 S 代号）**、本地模板跳过 AI、人工编辑可保存并复制、多入口共用同一流程）。
- 生产构建成功，PWA 正常；`npm audit` 0 漏洞。
- 固定输入 A/B（`.workbuddy/memory/tools/ab-test-fixed-input.mjs`，情感问题）：场景正确命中「情感问题」、Few-shot 命中张三示例、`max_tokens 2048`、长度目标 400 字；UI 最终 225 字 vs 旧版不可接受的 52 字（**4.3 倍**，且 UI 与 AI 返回完全一致，无截断）。
- 六档宽度（1512/1280/1100/900/760/390）**零横向溢出**、控制台**零错误**；截图 `.workbuddy/ui-review/2026-09-13-wizard/`。
- 边界确认：未触碰 Local First、Privacy Gateway 脱敏算法、`store.ts` 迁移、班级/事务/待办/评优/升学就业模块；未新增一级导航。

### 说明

A/B 的 225 字来自被拦截的模拟返回（用于验证"UI 不截断"），**真实字数需老师用真 Key 跑一次并在「AI 请求调试」面板核对**——这正是加调试面板的目的。

## 2026-09-14：材料输出入口合并 + AI 润色收敛为单弹窗

### 起因

老师实测后指出：材料输出页有**两个并列入口**（「从现有记录生成」本地模板 +「用分步流程生成」），但真正需要的只有一件事——**打开一条口述谈话记录，点一下润色，脱敏后交给 AI，再把结果贴回来**。分步流程页与这个心智不符，属于「功能都有，但不像一套系统」。

### 改动

1. **新建 `src/v2/AiPolishDialog.tsx`（核心）** —— 一屏内完成完整闭环：
   - 顶部三个下拉：**交给哪家 AI**（只列出已填 Key 的服务商）+ **模型** + **个人谈话模板**；选择写回本机 AI 设置，下次默认沿用。
   - **「AI 实际会看到的内容」折叠区**：本地原文 vs 去标识化内容的左右对照 + 逐项 finding（可替换 / 删除 / 恢复原文），摘要显示「已替换 N 处 · 已删除 M 处」。**复用 `detect` / `render`，未改脱敏算法**。
   - **「一键润色」**：按下才发请求，走 `buildTalkPromptLayers` 四层 Prompt（System → Scenario → Personal Style → Few-shot → User Content → Final Instruction）。
   - 结果区可直接编辑，附 **再自然一点 / 再正式一点 / 更详细 / 更简洁** 四个微调（复用同一份已确认 payload，不重发真实身份）。
   - **「贴回谈话记录」**：`restoreLocalIdentity` 在本机恢复真实姓名后写回该条 `finalRecord`，并同步存一份材料归档；恢复过程不经过外部 AI。
   - 底部操作栏 sticky 吸底；润色成功后自动收起隐私区，突出结果。
2. **入口合并为一个**：
   - 谈心谈话页 / 学生个人看板的谈话记录卡：原「交给 AI 分析（脱敏）」+「生成正式记录」→ **合并为「AI 润色」**；
   - 材料输出页：原「从现有记录生成」+「用分步流程生成（可选 AI 成文）」→ **合并为「生成材料」**，预览区提供「AI 润色」打开同一弹窗；
   - 四个入口（谈话页 / 学生看板 / 学生详情 / 材料输出）最终都走 `AiPolishDialog`，只是初始化数据不同。
3. **删除分步流程**：`src/v2/GenerationFlow.tsx` 与 `App.tsx` 的 `page="generate"` 路由、`generationSeed` / `sourcePage` / `startGeneration` 一并移除；`v2.css` 的 `gen-*` 样式替换为 `polish-*`。
4. **隐私边界不变**：仍展示本地原文、AI 实际 payload、识别字段与替换原因；人工点「一键润色」即为最终确认，Human in the Loop 未放松；API Key 只从本机设置读取，不出现在界面与调试记录中。

### 验证

- 单测 **199 项**通过（未删改既有断言）。
- Chromium **57 条**、WebKit **57 条**全部通过。新增 `tests/browser/ai-polish.spec.ts` **7 条**：配置项齐全、未配置服务商只提示去配置且不发请求、**只打开弹窗零外发请求**、**一键润色后 body 不含真实姓名且含 S 代号 + 本地恢复姓名**、结果可编辑并贴回（同步归档）、微调复用同一 payload、材料输出页共用同一弹窗。
- 受影响的既有用例同步更新：`talk-records.spec.ts`（弹窗名与结构）、`business.spec.ts`、`demo-consistency.spec.ts`（按钮名）。
- 生产构建成功；六档宽度（1512/1280/1100/900/760/390）**零横向溢出**、控制台**零错误**；截图 `.workbuddy/ui-review/2026-09-14-ai-polish/`。
- 边界确认：未触碰 Local First、Privacy Gateway 脱敏算法、`store.ts` 迁移；未新增一级导航。

## 2026-09-14（续）：查清「AI 返回内容为空」——从一句废话变成可排查

### 起因

老师实测截图：DeepSeek 一键润色后弹出「**DeepSeek 返回内容为空，请确认所选模型是否可用。**」，除此之外没有任何可用的排查信息。

### 取证结论

翻代码后确认：这句话是**唯一出口**，而且是最糟的一种处理方式。

- `callChatCompletion` 在 HTTP 200 但取不到正文时，只抛这一句话；
- 与此同时，**原始响应体、`finish_reason`、token 用量、是否只返回了 `reasoning_content` 全部被丢弃**——连调试面板里都没留，事后无法复盘。所以「为什么为空」当时无从判断，这不是运气差，是当时根本没留证据。
- 空正文在 200 下只有几种可能：①**输出额度被思维链吃光**（`finish_reason=length`）②模型只回了 `reasoning_content` ③被内容安全策略拦截 ④模型名不存在或网关改写响应。旧代码把它们混成同一句话。

### 改动

1. **`providers.ts` 空返回分类 + 自动重试**：
   - `sendChat()` 统一解析响应，保留 `finish_reason`、`usage`、`reasoning_content` 有无、**原始响应体（截断 2000 字）**；
   - `content` 兼容字符串与 **parts 数组**两种形态（新版 OpenAI 兼容接口会返回数组，旧代码会直接读到空）；
   - 200 却带 `error` 字段、响应非 JSON（被代理/网关改写）都单独报错，不再当正常返回；
   - **空返回先分类再决定是否重试**：`finish_reason=length` 或只回思考过程 → 自动把输出上限从 `DEFAULT_MAX_TOKENS(2048)` 提到 `RETRY_MAX_TOKENS(8192)` 重试一次；原因不明时**不盲目重试**（避免白花额度），直接给带 `finish_reason` 与响应片段的错误；
   - 新增 `AiCallError` / `aiCallDetails()` 携带诊断信息，新增 `onNotice` 回调——重试会**真实产生第二次外部请求**，界面必须如实说明，不能静默重试。
2. **界面**：`AiPolishDialog` 与 `PrivacyGateway` 显示重试提示（`.notice`，`role="status"`），失败时把诊断写进调试面板。
3. **`aiDebug.ts` / `AiDebugPanel.tsx`**：新增第 20–23 项——`finish_reason`、用量（入/出）、是否只回思考过程、**失败时的原始响应体**。下次再出问题，面板里直接能看到服务商原话。
4. **模型 ID 提醒**：保存的模型 ID 不在预设列表时（截图里的 `deepseek-flash` 正是这种情况），弹窗在发请求**之前**就提醒「可能是已停用的旧型号或填写有误，可点『拉取模型列表』核对」，不阻断使用。

### 验证

- 单测 **211 项**（新增 `tests/ai-response.test.ts` **12 项**：parts 数组、截断自动重试并加倍上限、只回思考过程、二次仍空的错误内容与诊断字段、未知原因不重试、内容过滤、200+error、非 JSON、HTTP 分类、未填模型不发请求）。
- Chromium **60 条**、WebKit **60 条**全部通过。`ai-polish.spec.ts` 新增 3 条：**截断后自动重试成功且界面如实说明（断言第二次 `max_tokens:8192`）**、两次都空时错误里带 `finish_reason=length` 与「非思考模型」建议、模型不在预设列表时的提醒。
- 界面实测（`.workbuddy/memory/tools/ui-check-empty-response.mjs`，走真实 UI + 拦截响应）：三种情形提示文案与预期一致；1440/1024/760/390 四档**零横向溢出**、控制台**零错误**；截图 `.workbuddy/ui-review/2026-09-14-ai-empty/`。
- 边界确认：未改脱敏算法、未改数据模型、未新增一级导航；重试只影响外部调用次数，且已在界面明示。

## 2026-09-14 学工系统入口 + 花名册导入模板

老师提出两件事：一是「把学工系统链接嵌进去，方便班主任过去办事」；二是「导入班级名单那里要有模板下载，不然字段统计可能有问题」。

### 1. 学工系统入口（可配置，只存本机）

- 新增 `src/v2/externalLinks.ts`。存储用独立键 `counselor-student-system-url`：**不进 `V2Space`，因此不触发数据迁移；也不进本地备份**——它只是学校系统的地址，不是学生数据。写入前做协议白名单校验，**只允许 http / https**，`javascript:` / `data:` / `file:` 一律拒绝；缺协议自动补 `https://`。
- **侧边栏导航下方常驻入口**：未设置时是「＋ 设置学工系统链接」，点开就地填写；已设置时是「学工系统 ↗」+ 域名 + 「修改链接」。之所以不放在 `.v2-sidebar-foot`，是因为它在窄屏是 `display: none`，常驻入口会消失。
- 两处上下文入口，都只在已配置时出现：谈话记录点「复制学工系统版本」成功后，同排出现「去学工系统粘贴 ↗」；待办中心里类型是「待回填学工系统」的条目，行内给「去学工系统回填 ↗」。
- 顶栏动作区**故意不动**：`tests/browser/alignment.spec.ts` 锁死 `.v2-top-actions > *` 恰好 2 个且同高同底，加第三个会直接打破这条回归。

### 2. 花名册导入模板

- 新增 `src/storage/rosterTemplate.ts`（纯逻辑）与 `src/components/rosterTemplateFile.ts`（文件生成）。**表头直接由 `rosterFields` 生成**，不再手写——这正是「字段统计出错」的根因：表头少一个字、多一个空格，`guessFields` 就整列丢掉，特殊关爱人数、挂科人数随之对不上。
- XLSX 模板两张表：「花名册」**只有表头**，「字段说明」逐字段写必填 / 写法 / 示例。CSV 模板带 BOM，Excel / WPS 双击不乱码。
- 导入前新增**列名体检**：认不出的列（整列忽略）与重复列（只有第一列生效）直接提示；「序号 / 编号 / 行号 / No.」这类辅助列不算问题，否则学校导出的表会每次都弹提示。
- `roster.ts` 抽出 `matchesRosterHeader()` / `isRosterHeader()` 复用同一套匹配（`guessFields` 行为未变），避免「体检说认得出、导入时认不出」两套逻辑打架。
- 模板表头下**不预置空行**：SheetJS 写入时会丢掉空值单元格，预置的文本格式留不住；而预置「示例-张三」这类假数据，有被当真名册导入的风险。学号 / 身份证号 / 手机号的文本格式要求改为写在界面提示与「字段说明」里。

### 3. 顺带修掉的复制失败静默

「复制学工系统版本」原来是 `await navigator.clipboard.writeText(...)` 且不 catch：WebKit / Safari 下可能因权限或失焦 reject，结果是**按钮毫无反应、也没有任何报错**（本轮 WebKit 回归里真实复现）。现改为 `src/v2/clipboard.ts` 的 `copyText()`（异步 API 失败退回 `execCommand`），彻底失败时在面板上给出「请展开『查看标准记录』手动复制」的提示。

### 验证

- 单测 **223 项**全过。新增 `tests/roster-template.test.ts` 6 项（表头同源且被 `guessFields` 全部识别、模板不含数据行、说明覆盖每个字段且只有姓名/学号标必填、CSV 带 BOM、XLSX 两张表且读回一致、列名体检）与 `tests/external-links.test.ts` 6 项（空值、补协议、协议白名单、非法地址、短地址、无存储时降级）。
- Chromium **65 条**、WebKit **65 条**全部通过。新增 `tests/browser/system-entry.spec.ts` 5 条：模板下载文件名（XLSX / CSV）、链接设置 → 刷新后仍在 → 修改 → 清除、非法地址被拒、复制后才露出跳转、剪贴板彻底不可用时给提示。
- 生产构建通过（TypeScript + Vite + PWA）。
- 未破坏稳定能力：CSS 只做追加（`cat >>`），没有删除或改名任何选择器；未改脱敏 detector、Privacy Gateway、IndexedDB 迁移与 S 代号。未新增后端、请求、遥测或 CDN——模板在浏览器内生成，链接只写 `localStorage`。

## 2026-09-14 补：桌面端打包（第一版：只有 macOS dmg）

### 背景

老师问「现在只能本地启动，能打包成 dmg 和 exe 吗」。仓库里 Tauri 2 的架子本来就有（`src-tauri/` + `@tauri-apps/cli` 2.11.4 + 全平台图标），但 `npm run desktop:build` 在本机**打 dmg 必失败**。

### 根因：Tauri 内置 `bundle_dmg.sh` 在 macOS 27 上坏了

不是配置问题，是 Tauri 自带的 `bundle_dmg.sh`（create-dmg 的 fork）与新系统不兼容：

```
Searching for mounted interstitial disk image using /dev/disk5s...
grep: bad regex '/dev/disk5s': brackets ([ ]) not balanced   ← 传给 grep 的正则方括号未转义
ERROR: unable to proceed with final disk image creation because the interstitial disk image was not found.
```

它靠 `grep` 认「临时挂载的中间镜像」，正则拼错 → 连试 9 次全失败 → 直接退出。更麻烦的是**失败时不卸载临时镜像**，会在 `/Volumes/dmg.XXXXXX` 留下残留（实测两个：`dmg.JWlTNn`、`dmg.1qHhgR`），残留还会连累下一次构建。`.app` 那一步本身是好的（Rust 编译、`xattr -crs`、ad-hoc 签名、Info.plist 都正常）。

### 处理

新增 `scripts/package-dmg.sh`：只让 tauri 出 `.app`，dmg 自己拼——`.app` + `/Applications` 软链 → `hdiutil create -format UDZO`。脚本开跑前先清理上次残留的挂载点，失败不留垃圾；结尾自动 `hdiutil verify` + `codesign --verify --deep --strict` 自检。代价是没有 Finder 窗口美化（那块本来要靠 osascript 操作 Finder，正是最容易挂的一环）。

新增命令：

| 命令 | 用途 |
| --- | --- |
| `npm run desktop:dmg` | 出 `.app` + 打 dmg（推荐，macOS） |
| `npm run desktop:dmg:only` | 用已有 `.app` 直接打 dmg（跳过构建） |
| `npm run desktop:build:win` | Windows 上打 NSIS 安装包（`tauri build --bundles nsis`） |
| `npm run desktop:build` | 原命令，保留；在本机会停在 dmg 一步 |

`.gitignore` 补 `dist-desktop/`。新增 `.github/workflows/desktop.yml`。

### 产物与验证

`dist-desktop/班主任AI工作台_0.1.0_arm64.dmg`，5.5 MB。已挂载核对内容（`.app` + `Applications` 软链；bundle id `cn.edu.counselor-ai-workbench`；最低 macOS 12.0），`hdiutil verify` 校验通过，`codesign --verify --deep --strict` 通过（ad-hoc），打包出的应用**实际启动成功并稳定运行**。

### 限制（都需老师决策，不是代码问题）

> 下面前两条已被下一节推翻，保留原文以记录当时的判断。

- **ad-hoc 签名、未公证**（无 Apple 开发者账号）。文件传到别人电脑上后 macOS 会拦「无法验证开发者」，需在「系统设置 → 隐私与安全性」点「仍要打开」，或对该 app 执行 `xattr -dr com.apple.quarantine`。本机不受影响（构建时已清 quarantine）。
- ~~**只出 arm64**（Apple Silicon）。要覆盖 Intel Mac，需 `rustup target add x86_64-apple-darwin` 后再出 universal 双架构包，本轮未做。~~
- ~~**`.exe` 本机打不了**：Tauri 不支持从 macOS 交叉编译到 Windows~~——当时结论有误，见下节。
- `bundle.windows.webviewInstallMode` 现为 `offlineInstaller`，会把 WebView2 离线安装包整个塞进 `setup.exe`，**体积约 150 MB 量级**（换来的是目标电脑断网也能装）。若目标电脑能联网，可改 `downloadBootstrapper` 换取小体积。

## 2026-09-14 补：桌面端打包（第二版：三平台产物全部打通）

老师要「三个都要」——Apple Silicon Mac、Intel Mac、Windows 全都要；并明确**学工系统链接不做预设**（项目后续开源，由每位老师自己填）。后者已在第一版实现（`DEFAULT_STUDENT_SYSTEM_URL = ""`），本轮只补了注释说明，代码未动。

### 1. macOS：改出 universal 双架构包

`scripts/package-dmg.sh` 增加 `--target <triple>`，产物目录、架构标签、文件名后缀都跟着走。新增 `npm run desktop:dmg:univ`（及 `:univ:only` 跳过构建的版本）。universal 包要求 `rustup target add x86_64-apple-darwin`，脚本会自己前置检查。

### 2. Windows：`.exe` 其实可以在 macOS 上交叉编译出来

第一版的结论「Tauri 不支持从 macOS 交叉编译到 Windows」**只对了一半**：官方不提供支持，但走 `cargo-xwin` 把 MSVC 目标（`x86_64-pc-windows-msvc`）的 Windows SDK / CRT 头文件与库拉下来，是可以编的，不必装 Visual Studio。新增 `scripts/package-nsis.sh` 固化这条链路（+ `npm run desktop:win`）。

需要三个前置：`rustup target add x86_64-pc-windows-msvc`、`cargo install cargo-xwin --locked`、`brew install llvm makensis`。

#### 踩到的三个坑（都值得记）

1. **`tauri-winres` 需要 `llvm-rc`**：编译 `.rc`（图标、版本信息）时调它，缺了会 `panicked ... NotAttempted("llvm-rc")`。`llvm` 是 Homebrew 的 keg-only 包，不进 PATH，脚本手动兜上 `/opt/homebrew/opt/llvm/bin`，并把 `$RC` 显式指过去（`embed-resource` 优先读 `$RC`）。

2. **`makensis` 在 locale 不合法时会崩**：表现为
   ```
   libc++abi: terminating due to uncaught exception of type std::bad_alloc
   ```
   排查时一度以为是 Homebrew 的包坏了——**连一个空 `Section` 都编不过**，换压缩器、换最小脚本全崩。真因是 NSIS 的已知 bug（sourceforge **#1165**，2016 年至今 open）：**macOS 上编译 Unicode 安装包时，若 `LC_ALL`/`LANG` 为 `C` 或空，makensis 必崩**；给一个带语言的 UTF-8 locale 就好。本机环境恰好是 `LANG=""` / `LC_*=C`。修法：脚本里 `export LC_ALL=en_US.UTF-8 LANG=en_US.UTF-8`。

   **连带的第二个坑**：设了 UTF-8 locale 之后，bash 会把非 ASCII 字节也算作标识符字符，于是 `echo "…（$TARGET）"` 里的 `$TARGET）` 被当成一个变量名 → `unbound variable`。凡是 `$VAR` 后面紧跟全角字符的，一律要写成 `${VAR}`。`package-dmg.sh` 里有一处同类写法（当时是 C locale 所以没暴露）一并修了。

3. **`tauri bundle` 打不了 nsis**：它只认宿主平台的目标列表（macOS 上是 `ios/app/dmg`），所以想跳过前端重建只能给 `tauri build` 传 `--config '{"build":{"beforeBuildCommand":""}}'`。脚本的 `--skip-frontend` 就是这个。

#### 两个体积版本

`bundle.windows.webviewInstallMode` 的两种取值各产一个，文件名后缀区分：

```sh
bash scripts/package-nsis.sh --skip-frontend          # offline：WebView2 离线包内置，220 MB
bash scripts/package-nsis.sh --skip-frontend --small  # online：安装时下载，4.4 MB
```

`tauri.conf.json` 里保持 `offlineInstaller` 不变（默认行为不改），`--small` 只在这一条命令上覆盖。

### 3. CI

`.github/workflows/desktop.yml` 重写：macOS job 原来走 `npm run desktop:build`（即坏掉的 `bundle_dmg.sh`），改为 `bash scripts/package-dmg.sh --target universal-apple-darwin`，出双架构 dmg；Windows job 保持 `--bundles nsis`。两个 job 的产物路径都改成实际位置。

### 产物与验证

| 文件（`dist-desktop/`） | 大小 | 说明 |
| --- | --- | --- |
| `班主任AI工作台_0.1.0_universal.dmg` | 11 MB | **Intel + Apple Silicon**，`lipo -archs` = `x86_64 arm64` |
| `班主任AI工作台_0.1.0_x64-setup-offline.exe` | 220 MB | 断网也能装 |
| `班主任AI工作台_0.1.0_x64-setup-online.exe` | 4.4 MB | 安装时联网下载 WebView2 |

- universal dmg：挂载核对通过（`.app` + `Applications` 软链、bundle id、最低 macOS 12.0），`hdiutil verify` checksum VALID，`codesign --verify --deep --strict` 通过，**解包出的通用二进制应用实际启动成功**。
- Windows 安装包：`file` 报 `PE32 executable (GUI) ... Nullsoft`（NSIS 安装程序本身是 32 位 PE，载荷仍是 64 位，属正常）。**本机无法运行验证**，需在 Windows 上实测。
- 单测 223 项全过。本轮未改动任何应用逻辑（`externalLinks.ts` 只改了注释）。

### 仍未解决 / 未做

- **签名与公证**：macOS 是 ad-hoc、未公证；Windows 安装包未签名（`tauri build` 明确提示 `skipping signing the installer`，跨平台编译时签名只在 Windows 宿主支持）。分发给同事会触发系统拦截提示。
- **仓库还没有 git remote**，CI 尚未实跑；GitHub 那边老师选的是「先不动」，仓库名已定为 `counselor-ai-workbench`。
- 开源协议老师选的是「暂不加」，仓库里没有 LICENSE。
- `.exe` 只在 Windows 上能真正验证；跨平台编译官方标注为 experimental。

## 已知问题

- 演示入口 `?mode=demo` 使用纯内存空间（`V2MemoryStore(createDemoV2Space())`），且 store 的 `useEffect` 依赖为 `[]`，**刷新或重新进入会重新播种演示数据，录入的谈话与待办不会保留**。这是有意的隔离设计（避免演示污染本机数据空间），但容易让老师误判为「记录丢失」。真实录入请使用正式入口 `/workbench`（IndexedDB 持久化）。
- AI 辅助已内置 DeepSeek / Kimi / 智谱 GLM / 通义千问 / 豆包 / Agens（免费）六家直连，需教师自备 API Key（Agens 免费）；未配置 Key 时仍可复制 Prompt 到外部 AI，离线可用性不变。
- 豆包（火山方舟）不提供模型列表接口，部分账号需填推理接入点 ID（ep- 开头），模型名请以控制台为准。
- 各服务商模型名迭代很快（DeepSeek 旧别名即于 2026-07-24 停用），内置预设可能滞后；设置页提供「拉取模型列表」与手填模型 ID 作为兜底。
- **思考型模型会把输出额度先花在思维链上**：若所选模型默认开启思考，2048 token 常在写出正文前就被用光，表现为「HTTP 200 但正文为空、`finish_reason=length`」。现已自动加大上限重试一次（2048 → 8192），仍失败会给出明确原因；**根治办法是改用非思考类模型**。
- 浏览器本地存储不应作为唯一备份；教师需要定期导出完整本地 JSON。
- 旧数据首次迁移有自动快照，但尚无图形化恢复界面。
- 花名册中的待办数量和最近谈话日期是导入快照，不包含原系统的明细正文。
- PDF 不支持扫描件 OCR；老式 `.doc` 和图片不在支持范围内。
- 主要自动化覆盖 Chromium 和 WebKit；Windows、Firefox 与系统级 PWA 安装仍需真实设备验证。
- 全仓库的「今天」统一取 UTC 日期（`selectors.ts` 的 `day()`、`App.tsx`、`demo.ts`、`business.ts` 等均为 `new Date().toISOString().slice(0, 10)`）。中国为 UTC+8，因此**本地 00:00–08:00 之间「今天」会比实际日期早一天**，会影响今日清单、今日推进、今日 / 本周缺勤等口径。这是横跨多文件的既有约定，本轮为保持全站一致未作改动；若修正需统一改为本地日历日并同步更新测试。

## 2026-09-14 补：修复桌面端「点了没反应」的按钮（外链 / 导出 / 剪贴板）

老师反馈「软件里的学工系统按钮不跳转，很多按钮都失效了」。排查结论：**应用逻辑没有坏**——
浏览器里 65 项 Playwright 全过、223 项单测全过、导航/弹窗/数据全正常；坏的是**打包成 App 之后
三类依赖浏览器能力的行为**（页面跑在 `tauri://localhost` 自定义协议里）：

1. **`target="_blank"` 开新窗口**：WebView 默认不注册新窗口处理器，点击被静默丢弃。
   受影响：侧栏「学工系统」、待办「去学工系统回填」、谈话卡「去学工系统粘贴」、AI 设置「获取 Key」。→ 这就是「学工系统按钮不跳转」。
2. **`<a download>` 下载**：WebView 没注册下载代理，blob 下载被静默丢弃。
   受影响：完整本地备份、谈话记录导出、材料导出 TXT、谈话模板包导出 JSON、花名册模板 CSV/XLSX。
3. **`navigator.clipboard`**：自定义协议不一定是安全上下文，部分 WebKit 版本取不到；
   三处裸调 `navigator.clipboard.writeText`（材料输出、隐私网关、AI 润色）会直接抛错 →「点了没反应」。

### 修法（零新增依赖）

- 新增 `src/v2/desktop.ts`（能力桥）+ `src-tauri/src/lib.rs` 三个命令：
  - `open_external`：只放行 http/https，macOS `open` / Windows `rundll32 url.dll,FileProtocolHandler` / Linux `xdg-open`；
  - `save_export_file`：写入系统「下载」目录，文件名净化 + 重名自动 `(1)`，返回落盘路径；
  - `reveal_in_folder`：在文件管理器定位导出结果（macOS `open -R` / Windows `explorer /select`）。
  - 走 `window.__TAURI_INTERNALS__.invoke`，**不引入 `@tauri-apps/api`**（少一个版本漂移点）。
- `externalLinkProps(url)` 统一四处外链：保留 `href`（浏览器中键仍可新开），桌面端接管点击。
- 导出统一 `saveExportFile()`：桌面端落盘后界面提示「已保存到下载文件夹：xxx」，浏览器退回 Blob 下载。
- 剪贴板统一 `copyText()`（clipboard.ts 改为再导出，避免两份实现）。
- 新增 `DesktopDiag`（`VITE_DESKTOP_DIAG=1` 打包时叠加自检面板），真机验证用。
- `scripts/package-nsis.sh` 修了一个 bash 3.2 `set -u` 下空数组的 unbound variable（`${EXTRA_ARGS[@]:+"${EXTRA_ARGS[@]}"}`）。

### 真机验证（打包后的 .app 内自检面板输出）

- 地址 `tauri://localhost`，桌面桥可用 ✓
- 写文件 ✓ `/Users/sherlockliu/Downloads/工作台能力自检.txt`
- 打开浏览器 ✓（example.com 已在系统浏览器打开）
- 剪贴板 ✓
- 223 项单测 + 65 项 Playwright 全部通过。

### 本轮改动文件

`src-tauri/src/lib.rs`、`src/v2/desktop.ts`（新）、`src/v2/DesktopDiag.tsx`（新）、`src/main.tsx`、
`src/v2/{clipboard,export,materials,App,AiSettingsPane,PrivacyGateway,MaterialsPane,AiPolishDialog,TemplateManager}.tsx?`、
`src/components/{rosterTemplateFile,RosterPane}.tsx`、`tests/talk-records.test.ts`、`scripts/package-nsis.sh`、README。
