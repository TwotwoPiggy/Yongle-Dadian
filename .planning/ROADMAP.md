# Milestone v1.6 Roadmap

**Goal:** 实现应用的更新能力。

| Phase | Name | Goal | Requirements | Status |
|-------|------|------|--------------|--------|
| 16 | Core Update Mechanism | 实现基于命令的基础更新能力及版本选择 | UPD-01, UPD-02 | Pending |
| 17 | Config Safety | 实现本地配置的备份与智能合并，防止更新覆盖 | UPD-03 | Pending |
| 18 | Rollback System | 实现安全回滚机制以应对更新失败 | UPD-04 | Pending |

---

## Phase 16: Core Update Mechanism
**Goal:** 实现基于命令的基础更新能力及版本选择
**Requirements:** UPD-01, UPD-02

**Success Criteria:**
1. 用户可以通过命令触发应用或配置库的更新。
2. 默认拉取最新版本（或主分支）。
3. 支持通过命令参数指定要拉取的目标分支或特定标签版本。
4. 能够正确处理版本冲突或告知用户需要手动干预。

---

## Phase 17: Config Safety
**Goal:** 实现本地配置的备份与智能合并，防止更新覆盖
**Requirements:** UPD-03

**Success Criteria:**
1. 更新操作启动前，自动将现有的配置（如 `config.json` 等）备份到指定安全目录。
2. 拉取新代码或配置后，能够自动与本地配置执行安全合并（Deep Merge），保留用户的私有数据（如 apiKey 等）。
3. 如果合并不成功，明确提示用户冲突，并保留备份文件供人工恢复。

---

## Phase 18: Rollback System
**Goal:** 实现安全回滚机制以应对更新失败
**Requirements:** UPD-04

**Success Criteria:**
1. 更新前自动记录当前版本的 commit hash 或创建对应的回滚锚点。
2. 若更新脚本失败（如依赖安装错误、启动崩溃），自动提示回滚。
3. 提供一键回滚命令，能将代码库状态恢复到更新前的锚点，同时恢复相关的本地配置。
