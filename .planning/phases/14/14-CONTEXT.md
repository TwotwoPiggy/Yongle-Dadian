# Phase 14 Context: Sync Robustness & Observability

## Domain
This phase delivers Sync Robustness & Observability capabilities, focusing on conflict warnings, sync status tracking, and periodic background knowledge synchronization.

## Canonical References
- [ROADMAP.md](file:///d:/Computers/AIDevelop/Tools/Skills/yongle-dadian/.planning/ROADMAP.md) - Phase 14 goals and requirements
- [REQUIREMENTS.md](file:///d:/Computers/AIDevelop/Tools/Skills/yongle-dadian/.planning/REQUIREMENTS.md) - HRDN-01, HRDN-02, HRDN-03

## Implementation Decisions

### 1. 冲突警告与解决流程 (Conflict Warning & Resolution)
- **Decision**: 采用明确的高亮警告 + 静默备份组合方案。发生冲突时中止合并并备份为 `.conflict`，同时在终端输出高亮警告提示用户处理。
- **Rationale**: 这样既保证数据不丢失（避免 Git 冲突标记破坏 Markdown 从而导致索引崩溃），又不会让自动化流程（如启动时自动 pull）因为要求交互而卡死。

### 2. 后台定时同步机制 (Background Sync Daemon)
- **Decision**: 集成在现有的 Node 启动脚本中，作为一个后台持续运行的 `setInterval` 轮询。
- **Rationale**: 跨平台兼容好，且生命周期与 Agent 开发会话绑定，不需要配置外部系统的 Cron。

### 3. 状态展示与感知 (Status Indicator & Awareness)
- **Decision**: 终端输出详尽状态 + 写入一个轻量级的 `.planning/SYNC-STATUS.md`。
- **Rationale**: 方便人工使用 `/yongle-sync status` 命令查看最新同步时间和待推送数量，同时也让 Agent 能在需要时读取 `SYNC-STATUS.md` 文件感知同步状态。

## Codebase Context
- [scripts/yongle-sync-hook.js](file:///d:/Computers/AIDevelop/Tools/Skills/yongle-dadian/scripts/yongle-sync-hook.js): Current startup hook script where the background interval will be added.
- [scripts/yongle-sync-knowledge.js](file:///d:/Computers/AIDevelop/Tools/Skills/yongle-dadian/scripts/yongle-sync-knowledge.js): Core sync logic that needs to handle the conflict backups and return status info.
- [commands/sync.md](file:///d:/Computers/AIDevelop/Tools/Skills/yongle-dadian/commands/sync.md): Command definition to add the `/yongle-sync status` flag and handling.
