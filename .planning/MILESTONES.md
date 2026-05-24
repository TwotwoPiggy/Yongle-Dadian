# Project Milestones History

## v1.5 v1.5 (Shipped: 2026-05-24)

**Phases completed:** 1 phases, 1 plans, 3 tasks

**Key accomplishments:**

- 实现 yongle-update 命令的完整自动更新与重新注入流程，包含 Git/npm 双轨检测、智能依赖更新和基于 manifest 的技能重注入。

---

## v1.4 v1.4 (Shipped: 2026-05-24)

**Phases completed:** 3 phases, 6 plans, 0 tasks

**Key accomplishments:**

- (none recorded)

---

## v1.1 Vector Semantic Search

**Shipped:** 2026-05-18  
**Scope:** Phases 7-9  
**Accomplishments:**

- Integrates LanceDB local vector database for zero-dependency vector indexing.
- Automated non-blocking background embedding pipeline (`yongle-embed.js`) triggered on postmortem confirmation.
- Concurrency pool limit 5 batch processor (`yongle-embed-all.js`) for backfilling stored Markdown.
- Hybrid Search (`yongle-hybrid-search.js`) fusing SQLite keyword query and LanceDB vector semantic query using Reciprocal Rank Fusion (RRF) with a 1.5x score boost for precise FTS keyword hits.
- Streaming CLI UI using ANSI cursor control to instantly render FTS results and dynamically update once vector search completes.

---
## v1.0 MVP

**Shipped:** Previous Session  
**Scope:** Phases 1-6  
**Accomplishments:**

- Created core rule infrastructure and directory setup.
- Implemented `/yongle-postmortem` error recap summaries.
- Implemented Active Watch process probe tracking.
- Implemented Dreaming background quiet summarize hook.
- Integrated SQLite database engine.
- Established local-first markdown persistence.
