# MIGRATION.md｜V1 → V2

# 一、总体原则
这是产品层大修，不是底层重写。

## 保留
优先复用：
- 文件解析
- 花名册导入
- IndexedDB 基础能力
- Student ID / stable mapping
- 脱敏引擎
- detector rules
- 人工复核
- PWA
- 本地网络隔离
- 测试框架

## 暂停/下线
- HTML 汇报相关开发
- 旧首页“六个 AI 功能入口”作为一级结构
- 主动进入式“脱敏中心”作为主入口

脱敏能力保留，但重定位为 AI Privacy Gateway。

---

# 二、V1 花名册升级

现状：
花名册主要服务脱敏。

V2：
花名册导入后创建：
- Class
- Student
- StudentSensitiveProfile（按字段）
并立即进入可浏览的班级/学生库。

必须提供旧数据 migration。

---

# 三、V1 workflow 模板升级
原 Prompt 工作流：
迁移为：
- ConversationTemplate
- MaterialTemplate
- AI Workflow
尽量保留现有模板内容。

---

# 四、V1 脱敏页面
保留为：
“隐私工具 / 高级工具”
或作为 AI 调用前的嵌入式确认弹层。

不要删除底层能力。

---

# 五、数据迁移安全
- 升级前自动本地备份
- migration 必须可测试
- 不允许静默丢失旧数据
- migration 失败时停止写入并提示
- 保留 JSON 导出恢复能力
