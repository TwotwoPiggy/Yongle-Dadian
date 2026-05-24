---
phase: 15-update-cli-workflow
plan: 01
subsystem: CLI
tags: [cli, update, git, registry, reinstall, injection]
requires: []
provides:
  - yongle-update 自动升级机制与 CLI 交互式指令
affects: []
tech-stack:
  added: []
  patterns: [MD5 hashing, self-update mechanism, CLI step numbering]
key-files:
  created:
    - scripts/yongle-update.js
    - commands/update.md
    - skills/yongle-config-export/SKILL.md
    - skills/yongle-config-import/SKILL.md
  modified:
    - bin/install.js
    - scripts/install-to-antigravity2.js
    - skills/yongle-update/SKILL.md
key-decisions:
  - "对 Git 模式和 npm 模式采用双轨制版本检测与升级流程"
  - "根据 MD5 前后比对 package-lock.json 来判定是否需要 npm install"
  - "通过扫描各个已知运行时的 install-manifest.json 进行技能的批量重注入"
patterns-established:
  - "MD5-based dependency check before running heavy installations"
requirements-completed: [UPGRADE-01, UPGRADE-02, UPGRADE-03, UPGRADE-04]
duration: 20min
completed: 2026-05-24
---

# Phase 15: Update CLI & Workflow Summary

**实现 yongle-update 命令的完整自动更新与重新注入流程，包含 Git/npm 双轨检测、智能依赖更新和基于 manifest 的技能重注入。**

## Performance

- **Duration:** 20 min
- **Started:** 2026-05-24T16:30:39+08:00
- **Completed:** 2026-05-24T16:45:00+08:00
- **Tasks:** 3
- **Files modified:** 3
- **Files created:** 4

## Accomplishments
- **双轨检测与安装**：脚本在 `.git` 存在时通过 `git fetch` 和落后 commit 数量检测更新，并采用 `git pull` 拉取；否则通过 `npm view` 最新版与本地版本比较，执行 `npm install -g yongle-dadian@latest`。
- **智能依赖更新**：在 Git 模式拉取前后对比 `package-lock.json` 的 MD5，只在内容改变时执行 `npm install`。
- **凭证扫描与重注入**：遍历主流 AI 代理运行时目录，检查其下 `yongle/install-manifest.json`，自适应执行重注入安装；若无，默认重新注入 `antigravity` 的全局安装。
- **状态回滚安全**：更新失败时，Git 模式下能回退到更新前记录的 Commit Hash。

## Files Created/Modified
- `scripts/yongle-update.js` (NEW) - 核心自动更新流程与重注入控制脚本。
- `commands/update.md` (NEW) - yongle-update 的 CLI 命令描述定义。
- `skills/yongle-update/SKILL.md` (MODIFIED) - 移除占位伪代码，规范化为引导 Agent 执行 `yongle-update.js`。
- `skills/yongle-config-export/SKILL.md` (NEW) - 同步上次遗留的配置导出技能定义到源码库。
- `skills/yongle-config-import/SKILL.md` (NEW) - 同步上次遗留的配置导入技能定义到源码库。
- `bin/install.js` (MODIFIED) - 在 `YONGLE_SKILLS` 中注册 `yongle-config-export` 和 `yongle-config-import`，使其可被安装。
- `scripts/install-to-antigravity2.js` (MODIFIED) - 在 `YONGLE_SKILLS` 数组中添加对应的注册。

## Decisions Made
- 将 `yongle-config-export` 和 `yongle-config-import` 两个新增的技能合并并正式归档到本项目 `skills/` 源码库及 `install.js` 安装清单中，防止后续打包分发时遗漏。
- 重注入如果失败并不需要执行代码回滚，只需在控制台高亮指示用户手动执行 `bin/install.js` 即可，保持业务逻辑的可恢复性。

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
- 在验证 `bin/install.js` 中的新技能注册时发现，先前里程碑引入的 `yongle-config-export` 和 `yongle-config-import` 在本地库的 `skills/` 下缺失了物理文件（它们仅作为全局插件存在），通过从插件目录复制并规范化变量为 `{{YONGLE_INSTALL_DIR}}`，补齐了这一遗漏。

## Next Phase Readiness
- 自动更新工作流（Phase 15）的所有任务均已测试通过并达到成功标准，可进入下一阶段。

---
*Phase: 15-update-cli-workflow*
*Completed: 2026-05-24*
