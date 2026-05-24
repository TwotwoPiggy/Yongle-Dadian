# Milestone v1.5 Roadmap

**Goal**: 实现 Yongle Dadian 的自更新机制，允许通过命令一键升级并重新注入最新技能。
**Requirements Mapped**: 4/4
**Status**: Completed Phase 15

## Phases

| Phase | Title | Goal | REQ-IDs | Status |
|-------|-------|------|---------|--------|
| 15 | Update CLI & Workflow | 实现 yongle-update 命令和更新脚本 | UPGRADE-01, UPGRADE-02, UPGRADE-03, UPGRADE-04 | Completed |

---

## Phase Details

### Phase 15: Update CLI & Workflow
**Goal**: 实现 yongle-update 命令和更新脚本
**Requirements Mapped**:
- **UPGRADE-01**: 提供命令 (`yongle-update`) 以检查本地与最新版本。
- **UPGRADE-02**: 根据安装模式 (Git/NPM) 自动拉取更新或重新安装。
- **UPGRADE-03**: 更新拉取后，自动执行 `install.js` 以重新注入最新技能和工作流至 Antigravity。
- **UPGRADE-04**: 过程输出清晰的日志与进度，并在成功后通知用户。

**Success Criteria**:
1. 运行 `/yongle-update` 能正确检测当前版本和最新版本。
2. 在本地以 Git 仓库模式下，能执行 `git pull` 更新代码。
3. 更新完成后，脚本能正确调用并成功执行 `install.js --global --antigravity`，终端显示 "Update successful"。
