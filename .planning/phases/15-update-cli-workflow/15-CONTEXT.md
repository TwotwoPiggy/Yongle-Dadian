# Phase 15: Update CLI & Workflow - Context

**Gathered:** 2026-05-24
**Status:** Ready for planning

<domain>
## Phase Boundary

实现 `yongle-update` 命令的完整更新流程——让用户通过一个命令检查版本、拉取更新、自动安装依赖变更、并重新注入最新技能到所有已安装的 AI Agent 运行时。

更新操作为纯脚本化执行，不涉及 LLM 调用。核心逻辑封装在 `scripts/yongle-update.js` 中，SKILL.md 仅引导 Agent 执行该脚本。用户也可直接在终端手动运行。

</domain>

<decisions>
## Implementation Decisions

### 版本检测策略
- **D-01:** 采用双轨制版本检测。检测安装目录是否包含 `.git`：
  - **Git 仓库模式**: `git fetch origin` → `git rev-list HEAD..origin/main --count` 计算 commit 差距
  - **npm 安装模式**: `npm view yongle-dadian version` vs 本地 `package.json` 版本号
- **D-02:** 当前项目为 Git 仓库（remote: TwotwoPiggy/Yongle-Dadian），版本 1.0.0。尚未发布到 npm，因此当前阶段 Git 模式为主路径，npm 模式为预留路径。

### 更新执行流程
- **D-03:** Git 模式下执行 `git pull origin main` 拉取更新。
- **D-04:** 依赖更新采用智能检测——pull 前保存 `package-lock.json` 的 hash，pull 后对比。仅在 hash 变化时才执行 `npm install`，避免不必要的网络开销（vectordb 是 native 包，重装较慢）。
- **D-05:** npm 模式下执行 `npm install -g yongle-dadian@latest` 直接安装最新版。

### 回滚策略
- **D-06:** 标准回滚——拉取前记录当前 commit hash，若 `git pull` 或 `npm install` 失败，自动执行 `git reset --hard <原始hash>` 回到原版本。
- **D-07:** 重注入步骤（install.js）失败时不回滚代码（因为代码已经更新成功），而是清晰提示用户手动执行 `node bin/install.js --<runtime> --global` 完成注入。

### 重注入范围与策略
- **D-08:** 基于 manifest 自动重注入所有已安装运行时。扫描已知运行时目录下的 `install-manifest.json`，提取 `runtime` 和 `scope` 字段，对每个执行 `node bin/install.js --<runtime> --<scope>`。
- **D-09:** `install-manifest.json` 已由 install.js 在安装时写入，记录了 runtime 名称、scope（global/local）、安装时间、源路径等。这是现成的重注入数据源。

### 日志与进度展示
- **D-10:** 复用 install.js 的视觉风格——永乐大典 ASCII Banner + ANSI 颜色码（cyan/green/yellow/red）+ ✓/✗/▸ 状态图标。
- **D-11:** 增加步骤编号 `[1/4]` 展示整体进度感知。4 个步骤：检查当前版本 → 检查最新版本 → 拉取更新 → 重新注入技能。
- **D-12:** 最终输出包含版本升级 Banner（`v1.0.0 → v1.1.0`）+ 重启提示。

### 架构决策
- **D-13:** 将全部更新逻辑封装在 `scripts/yongle-update.js` 中，该脚本完全自包含、不依赖 LLM。SKILL.md 仅引导 Agent 执行 `node <path>/scripts/yongle-update.js`。
- **D-14:** 不引入额外依赖（spinner 等），保持项目零外部进程依赖的约束。

### Agent's Discretion
- 回滚策略细节（标准回滚 vs 轻量级 vs 完整）——已决策为标准回滚
- 日志风格细节——已决策为复用 install.js + 步骤编号

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 核心安装器
- `bin/install.js` — 成熟的多运行时安装器，支持 --antigravity/--claude/--gemini 等，含 install-manifest.json 写入逻辑。重注入步骤直接调用此文件。
- `scripts/install-to-antigravity2.js` — 旧版 Antigravity 2.0 专用安装脚本（已被 install.js 取代，仅供参考）

### 现有 Update 技能骨架
- `skills/yongle-update/SKILL.md` — 当前占位级伪代码，需要重写为引导 Agent 执行 `scripts/yongle-update.js` 的指令

### 项目配置
- `package.json` — 项目元数据、bin 入口、dependencies 列表

### 参考实现
- `D:\Computers\AIDevelop\Tools\Skills\get-shit-done\get-shit-done\workflows\update.md` — GSD 的更新工作流实现，可参考其版本检测、确认流程和输出格式
- `D:\Computers\AIDevelop\Tools\Skills\get-shit-done\commands\gsd\update.md` — GSD 更新命令定义

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **install.js**: 完整的多运行时安装逻辑，含 `copyDir`、`removeDir`、路径解析、manifest 写入。重注入步骤可直接通过 child_process 调用。
- **ANSI 颜色常量**: install.js 中已定义 cyan/green/yellow/red/bold/dim/reset，可提取为共享模块或直接复制到 yongle-update.js 中。
- **Banner 模板**: install.js 中的永乐大典 ASCII 框和版本展示模板可直接复用。
- **install-manifest.json 结构**: `{ version, installed_at, source, runtime, scope, skills, workflows, scripts }`

### Established Patterns
- **SKILL.md 占位符替换**: install.js 使用 `{{YONGLE_INSTALL_DIR}}` 占位符，在安装时替换为实际绝对路径。yongle-update.js 的 SKILL.md 也应遵循此模式。
- **package.json bin 入口**: `yongle-dadian` → `bin/install.js`，用于 npx 全局安装场景。
- **YONGLE_SKILLS 列表**: install.js 和 install-to-antigravity2.js 中都维护了技能名称列表，包含 `yongle-update`。

### Integration Points
- **yongle-update.js → install.js**: 更新完成后通过 `child_process.execSync` 调用 install.js 进行重注入
- **yongle-update.js → package.json**: 读取当前版本号
- **yongle-update.js → .git**: 检测安装模式、执行 git 操作
- **yongle-update.js → manifest**: 扫描各运行时目录的 install-manifest.json 获取已安装列表
- **SKILL.md → yongle-update.js**: SKILL.md 指引 Agent 执行脚本，路径通过占位符 `{{YONGLE_INSTALL_DIR}}` 解析

</code_context>

<specifics>
## Specific Ideas

- 输出格式模仿 install.js 的 Banner + 步骤编号（示例在讨论中已确认）
- 参考 GSD 的 update.md 工作流（用户明确提供了参考路径 `D:\Computers\AIDevelop\Tools\Skills\get-shit-done`），但实现上应远比 GSD 简洁——GSD 需要处理 8+ 运行时和复杂的本地 patch 系统，yongle-dadian 只需 Git/npm 双轨 + manifest 扫描
- 成功后的输出信息应包含中文（与 install.js 的 `知识就是力量` 风格一致）

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 15-Update CLI & Workflow*
*Context gathered: 2026-05-24*
