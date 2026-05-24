# Phase 14 Discussion Log

## 1. 冲突警告与解决流程 (Conflict Warning & Resolution Flow)
- **Options Presented**:
  - 静默备份为 `.conflict`
  - 明确的高亮警告 + `resolve`
  - 文本级的自动合并
- **User Selection**: (Recommended) 我建议采用明确的高亮警告 + 静默备份组合方案。这样既保证数据不丢失（无 Git 冲突标记破坏索引），又不会让自动化流程（如启动时自动 pull）因为要求交互而卡死。
- **Notes**: To prevent index breaking, standard Git marker merging is avoided.

## 2. 后台定时同步机制 (Background Sync Daemon)
- **Options Presented**:
  - (Recommended) 集成在现有的 Node 启动脚本中，作为一个后台持续运行的 `setInterval` 轮询
  - 在系统层面配置 Cron 或任务计划程序
  - 其他
- **User Selection**: 集成在现有的 Node 启动脚本中，作为一个后台持续运行的 `setInterval` 轮询。跨平台兼容好，且生命周期与 Agent 开发会话绑定。
- **Notes**: Eliminates the need for external OS dependencies.

## 3. 状态展示与感知 (Status Indicator & Awareness)
- **Options Presented**:
  - (Recommended) 终端输出详尽状态 + 写入一个轻量级的 `.planning/SYNC-STATUS.md`
  - 仅作为终端命令输出
  - 仅终端输出，但在发现冲突或同步失败时，主动弹窗或打印警告日志
- **User Selection**: (Recommended) 终端输出详尽状态 + 写入一个轻量级的 `.planning/SYNC-STATUS.md`。这样既方便人工使用命令查看，又让 Agent 能在需要时读取文件感知同步状态。
- **Notes**: Dual-purpose observability for both human and agent.
