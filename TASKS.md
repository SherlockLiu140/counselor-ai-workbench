# 当前维护任务

项目已进入长期增量维护阶段。当前没有待开发的新模块。

每次维护应：

1. 明确问题对应的现有业务流程，避免扩大范围。
2. 保留 Local First 和 Privacy Gateway 边界。
3. 不破坏 IndexedDB 旧数据迁移和稳定 S 代号。
4. 使用虚构数据增加必要的回归测试。
5. 验证 `/workbench`、`/` 和 `/workbench?mode=demo`。
6. 更新 `docs/PROGRESS.md` 与 `docs/HANDOFF.md` 中受影响的事实。

历史开发任务只保存在 `docs/archive/v1/`，不作为当前待办。
