---
status: complete
phase: 15-update-cli-workflow
source: 15-01-SUMMARY.md
started: 2026-05-24T18:38:14Z
updated: 2026-05-24T18:45:35Z
---

## Current Test

[testing complete]

## Tests

### 1. 自动更新检测与模式识别
expected: |
  运行 `node scripts/yongle-update.js` 时，能够成功加载并识别出当前安装模式为 “Git 仓库开发模式”。
  接着通过 git fetch 远程状态，并在本地领先于远程或没有可用更新时，在步骤 [1/4] 中正确输出：
  “✓ 已经是最新版本，无需更新。”
result: pass

### <h3>2. 智能依赖项检查与更新</h3>
expected: |
  在步骤 [2/4] 和 [3/4] 中，拉取代码后能够基于 MD5 哈希对比 package-lock.json 的变化。
  如果依赖没有发生更改，正确在日志中显示：
  “✓ 依赖未发生变化，跳过 npm install。”
result: pass

### 3. 技能重新注入与注册
expected: |
  在步骤 [4/4] 中，能够正确扫描所有主流 AI 代理运行时的安装凭证（install-manifest.json），并逐一调用 install.js 对其进行技能的重注入。
  重新注入时，应成功为目标运行时（如 Antigravity）注入更新后的 yongle-update 技能，且包含本周期补充归档 of yongle-config-export 和 yongle-config-import 技能。
result: pass

### 4. 异常自动回滚（安全测试）
expected: |
  在 Git 模式拉取/升级过程中，若遭遇网络、文件系统等外部严重异常导致中途失败，更新脚本能够自动捕获，并正确执行 git reset --hard 恢复至升级前的初始 Commit。
result: pass

## Summary

total: 4
passed: 4
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none yet]
