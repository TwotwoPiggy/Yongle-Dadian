# Phase 13: Discussion Log

**Date:** 2026-05-24
**Duration:** ~5 minutes
**Mode:** Interactive (default)

## Areas Discussed

### 1. 拉取后的索引重建策略

**Options presented:**
1. 全量重建 — 拉取后调 reindex.js + embed-all.js，简单可靠
2. 增量 diff — 用 git diff 找出变更文件，只处理它们
3. 混合策略 — SQLite 用增量，LanceDB 放后台异步

**User selection:** 用户请求推荐 → Agent 推荐全量重建（因 reindex.js 和 embed-all.js 内建幂等/增量机制） → 用户确认

**Decision:** D-01 — 全量重建（利用内建幂等性实现等效增量）

---

### 2. 自动拉取触发时机

**A) Trigger timing:**
1. 会话启动时立即拉取
2. 首次 search 时懒加载

**User selection:** 会话启动时立即拉取

**B) Failure handling:**
1. 静默忽略
2. 给一行警告

**User selection:** 给一行警告

**Decisions:** D-02 (会话启动拉取), D-03 (失败给警告不中断)

---

### 3. 多设备并发合并策略

**Options presented:**
1. 文件粒度 + git rebase — 独立文件无冲突，同文件冲突用 rebase
2. 文件粒度 + 双副本保留 — 冲突时保留两个版本
3. 简单 git pull --rebase — 失败中断提示手动处理

**User selection:** 文件粒度 + git rebase

**Follow-up: 同步方向性**
1. 推送后自动拉取
2. 推送和拉取分离
3. 双向同步命令（先拉后推）

**User selection:** 用户请求推荐 → Agent 推荐双向同步 → 用户确认

**Decisions:** D-04 (文件粒度 + rebase), D-05 (双向同步 pull→reindex→push)

## Agent Discretion Items

- Hook 注册机制
- Rebase 冲突检测与 .conflict-* 文件创建逻辑
- Pull 失败的错误信息格式
- 派生文件（INDEX.md, query_cache.json）是否同步

## Deferred Ideas

None

---
*Generated: 2026-05-24*
