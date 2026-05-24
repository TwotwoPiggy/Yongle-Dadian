# Phase 15: Update CLI & Workflow - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-24
**Phase:** 15-Update CLI & Workflow
**Areas discussed:** 版本检测策略, 更新执行流程, 重注入范围与策略, 日志与进度展示

---

## 版本检测策略

| Option | Description | Selected |
|--------|-------------|----------|
| Git 优先 | 本地检测 Git 仓库 → git fetch + 比较 remote HEAD；非 Git 回退到 npm view | |
| npm 优先 | 始终用 npm view 获取最新版本号，本地从 package.json 读取 | |
| 双轨制 | Git 仓库模式用 git fetch + rev-list 计算 commit 差距；npm 安装模式用 npm view 比较版本号 | ✓ |
| 仿 GSD 模式 | 维护 VERSION 文件 + npm view 对比 | |

**User's choice:** 双轨制（经 Agent 推荐后确认）
**Notes:** 当前项目为 Git 仓库且尚未发布到 npm，Git 模式是主路径；npm 模式为未来预留。

---

## 更新执行流程 — 依赖安装

| Option | Description | Selected |
|--------|-------------|----------|
| git pull 后自动 npm install | 确保新依赖始终同步 | |
| 智能检测 | 对比 package-lock.json hash，仅变化时才 npm install | ✓ |
| 不自动 npm install | 只拉代码，让用户自行安装依赖 | |

**User's choice:** 智能检测（经 Agent 推荐后确认）
**Notes:** vectordb 是 native 包，重装较慢，应避免不必要的 npm install。

---

## 更新执行流程 — 回滚策略

| Option | Description | Selected |
|--------|-------------|----------|
| 轻量级回滚 | 失败不做特殊处理，只输出错误信息 | |
| 标准回滚 | 拉取前记录 commit hash，失败时 git reset --hard | ✓ |
| 完整回滚 | 备份整个目录，失败时恢复备份 | |

**User's choice:** 你决定
**Notes:** Agent 选择标准回滚。重注入失败时不回滚代码（代码已更新），而是提示用户手动执行 install.js。

---

## 重注入范围与策略

| Option | Description | Selected |
|--------|-------------|----------|
| 读取 manifest 自动重注入 | 扫描各运行时目录的 install-manifest.json，自动重注入所有曾安装过的运行时 | ✓ |
| 只注入当前运行时 | 只重注入触发更新的运行时 | |
| 用户确认后重注入 | 显示列表让用户选择要重注入哪些运行时 | |

**User's choice:** 你决定
**Notes:** Agent 选择基于 manifest 自动重注入。install-manifest.json 已有完整的安装记录，是现成数据源。

---

## 日志与进度展示

| Option | Description | Selected |
|--------|-------------|----------|
| 复用现有风格 | 与 install.js 保持一致的 ✓/✗/▸ + ANSI 颜色码 + 简洁日志 | |
| 复用 + 步骤编号 | 保持 install.js 风格，增加 [1/4] 步骤编号展示进度 | ✓ |
| 更丰富的进度展示 | 加入 spinner 动画、耗时统计 | |
| 仿 GSD Banner 风格 | 带 ASCII 边框和版本号的开头 Banner + 分步输出 | |

**User's choice:** 就这样，我喜欢这个风格（经 Agent 展示输出示例后确认）
**Notes:** 不引入 spinner 等额外依赖，保持零外部进程依赖约束。

---

## Agent's Discretion

- 回滚策略（用户说"你决定"）→ 选择标准回滚
- 重注入策略（用户说"你决定"）→ 选择基于 manifest 自动重注入
- 日志风格推荐 → 复用 install.js + 步骤编号

## 补充讨论

用户询问"更新操作会调用 LLM 吗？"——确认不会。更新操作为纯脚本化执行，核心逻辑封装在 `scripts/yongle-update.js` 中，SKILL.md 仅引导 Agent 执行该脚本。

## Deferred Ideas

None — discussion stayed within phase scope.
