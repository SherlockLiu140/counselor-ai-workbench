# 班主任 AI 工作台｜维护交接

## 1. 产品定位

这是高职 / 大专班主任、辅导员的 Local First 个人工作台。学校学工系统负责正式审批、上报和统一留痕；本工作台负责日常过程管理、本地归档和材料整理。首页应回答“班里现在有什么事”和“下一步做什么”，不能改造成聊天首页。

## 2. 当前技术栈

- Vite、React 19、TypeScript 严格模式
- IndexedDB 原生 API
- SheetJS、Mammoth、PDF.js，本地打包且不从 CDN 加载
- Vite PWA / Workbox
- Vitest、Playwright（Chromium / WebKit）
- 可选 Tauri 桌面构建

## 3. 目录结构

| 路径 | 职责 |
| --- | --- |
| `src/main.tsx` | 唯一应用入口 |
| `src/v2/App.tsx` | 正式工作台主壳和核心页面编排 |
| `src/v2/` | 学生、事件、待办、谈话、特殊关爱、奖助、升学就业和材料业务 |
| `src/adapters/` | TXT / CSV / XLSX / DOCX / PDF 本地解析 |
| `src/engine/` | 标识识别、去标识化、泛化和人工复核核心 |
| `src/storage/` | 花名册解析、稳定映射及旧空间迁移兼容 |
| `src/components/RosterPane.tsx` | 正式花名册字段映射和预览组件 |
| `tests/` | 单元、迁移和隐私回归测试 |
| `tests/browser/` | 正式业务黄金流程 |
| `docs/archive/v1/` | 只读历史资料，不作为当前需求来源 |

`src/v2/`、`V2Space` 等内部迁移期命名暂时保留，因为批量改名会扩大回归面；用户界面、正式路由和正式文档不显示版本概念。

## 4. 核心数据模型

`src/v2/types.ts` 中的 `V2Space` 是当前聚合空间，包含：

- `ClassRecord`、`StudentRecord`、`StudentSensitiveProfile`
- `AcademicRecord`、`AttendanceRecord`、`StudentRoleHistory`
- `EventRecord`、`TaskRecord`、`ConversationRecord`
- `AwardProject`、`AwardApplication`、`CareerPlan`
- `MaterialArchive`、谈话模板、稳定身份代号

事件、待办和谈话通过 ID 双向关联。特殊关爱是导入值或教师人工维护的状态，宗教、性取向、心理和家庭字段不得自动触发该状态。

## 5. Local First 原则

原始学生资料和业务记录默认只进入当前浏览器 IndexedDB。演示和会话模式使用独立内存空间。禁止在未获得明确产品变更授权时增加账户、后端数据库、云同步、遥测、埋点或自动学工系统写入。

数据库名仍为 `counselor-workbench-v1`，这是必须保留的存储兼容标识。`V2IndexedStore.initialize()` 会在同一事务中读取旧 `space`、保存 `v1-before-v2` 快照并写入当前 `v2-space`；不要为了命名整洁改数据库名或删除 `src/storage/store.ts`，否则已有浏览器数据可能无法迁移。

## 6. Privacy Gateway

所有“AI 帮我……”操作必须进入 `src/v2/PrivacyGateway.tsx`：

1. 按当前任务构建最小必要来源。
2. 使用 `src/engine/` 检测姓名、学号、电话、身份证、邮箱、地址等字段。
3. 展示本地原文、AI 实际 payload、识别理由和替换操作。
4. 教师人工确认后才允许复制 Prompt。
5. AI 返回由教师手工粘贴，在本机把稳定 S 代号恢复为姓名。
6. 教师再次审核后才能保存。

身份证、电话、住址、宿舍、宗教和性取向默认不得进入 payload。不得增加绕过 Gateway 的 AI 网络调用。

## 7. 重要业务流程

- 缺勤：班委反馈 → 登记事件 → 待谈话 → 谈话 → 复查待办 → 结案。
- 特殊关爱：首页 KPI → 目录 → 学生详情 → 谈话 / 待办 / 事件；多个关爱类型并存且不能互相覆盖。
- 谈话：粗略口述 → 本地模板成文或 AI 辅助 → Privacy Gateway → 本地恢复身份 → 人工审核。
- 评奖评优：项目 → 候选 → 材料核对 → 提交 → 结果 → 学生详情。
- 升学就业：方向和进展档案 → 谈话 / 跟进 → 材料输出。
- 材料输出：复用已有事件、谈话、待办和业务档案 → 本地归档；AI 优化仍经过 Gateway。

## 8. 正式路由

- `/workbench`：正式工作台
- `/`：同一正式工作台
- `/workbench?mode=demo`：100 人虚构演示
- `/workbench?mode=session`：刷新即清空的独立会话空间

查询参数 `v` 不再参与路由判断。不存在版本切换或汇报路由。

## 9. 测试命令

```sh
npm test
npm run test:browser
npm run test:browser:webkit
npm run check
npm audit
```

浏览器测试会自动启动 `127.0.0.1:4173` 的生产预览。测试数据必须是虚构数据。

## 10. 构建命令

```sh
npm run build
npm run preview
npm run build:desktop
npm run desktop:build
```

开发命令为 `npm run dev`。PDF.js worker、字库和字符映射由 `scripts/prepare-pdf-assets.mjs` 在开发与构建前复制到本地 public 资源。

## 11. 不能随意重构的模块

- `src/v2/store.ts` 的事务迁移和 IndexedDB store 名称
- `src/storage/` 的旧空间读取与稳定 S 代号兼容
- `src/engine/` 的 detector、重叠区间处理和人工复核契约
- `src/v2/PrivacyGateway.tsx`
- 事件、待办、谈话的 ID 关联和结案约束
- `src/adapters/document.ts` 的文件限制与本地解析安全边界
- PWA 资源缓存和 Tauri CSP

## 12. 当前已知问题

- AI 使用复制 / 粘贴，没有内置 API。
- 旧空间快照没有图形化恢复界面。
- 浏览器存储需要教师主动导出 JSON 作为额外备份。
- 扫描 PDF、图片 OCR 和老式 `.doc` 不支持。
- 花名册导入的待办数和最近谈话日期只是快照。
- Windows、Firefox 和系统级 PWA 安装仍需真实设备验证。

## 13. 后续修改约定

- 只做用户明确提出的增量，不擅自增加模块。
- 修改数据模型时先写迁移和回滚考虑，再改 UI。
- 修改隐私 payload 时必须增加“不包含无关敏感字段”的测试。
- 修改核心流程时同时维护对应 Playwright 黄金流程。
- 不把历史归档重新接回产品入口。
- 每轮结束更新 `docs/PROGRESS.md`；架构或维护约束变化时同步更新本文件。
