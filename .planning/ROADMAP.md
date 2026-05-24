# Product Roadmap

**Goal:** 构建支持上下文总结与沉淀的专属 AI 协作扩展库 (AI Agent Skills Library)。

## Milestones

- ✅ **v1.0 MVP** — Phases 1-4 (Shipped)
- ✅ **v1.0.5 Performance** — Phases 5-6 (Shipped)
- ✅ **v1.1 Vector Semantic Search** — Phases 7-9 (Shipped 2026-05-18)
- ✅ **v1.3 Network Proxy Support** — Phases 10-11 (Shipped 2026-05-19)

## Completed Phases (Phases 1-11)

<details>
<summary>✅ View Shipped Execution History</summary>

### Version X: AI Agent Skills V1
*Focus: 基础运行态建立，跑通经验捕获和待机离线总结核心链路。*

- [x] **Phase 1**: 基础架构脚手架与存储协议引擎 (Completed)
- [x] **Phase 2**: “永乐大典” 核心复盘链路 (Post-mortem Extract) (Completed)
- [x] **Phase 3**: “永乐大典” 过程探针 (Active Watch & Tag) (Completed)
- [x] **Phase 4**: “做梦” 闲置总结守护机制 (Dreaming) (Completed)

### Version Y: Performance & Retrieval (Fast Follows)
*Focus: 结构化查询、多库检索联动。*

- [x] **Phase 5**: SQLite 本地倒排支持与快速检索 (Completed)
- [x] **Phase 6**: Sync & Cloud Push (Completed)

### Version 1.1: Vector Semantic Search
*Focus: 引入向量数据库与大模型 Embedding，实现从“关键词检索”到“语义意图检索”的跨越。*

- [x] **Phase 7**: Vector Storage Infrastructure (Completed 2026-05-18)
- [x] **Phase 8**: Embedding Generation Pipeline (Completed 2026-05-18)
- [x] **Phase 9**: Hybrid Search & Retrieval (Completed 2026-05-18)

### Version 1.3: Network Proxy Support
*Focus: Embedding 与 Agent 大模型接口的代理支持。*

- [x] **Phase 10**: Proxy Request Engine (HTTP/HTTPS Proxy 请求引擎开发，支持 `yongle.proxy` 配置与环境变量自动回退) (Completed 2026-05-19)
- [x] **Phase 11**: Agent API Refactoring & Diagnostics (将代理模块接入 `yongle-embed.js` 和 `yongle-agent-api.js`，并添加代理诊断机制与单元测试) (Completed 2026-05-19)

</details>

## Next Planned Work
- 暂无，已准备好规划下一个里程碑。

## Version 1.4: Multi-Device Sync
*Focus: 多设备配置与知识库同步*

### Phase 12: Config Sync & Manual Export/Import
**Goal:** Users can sync config across devices (apiKeys stripped) and manually export/import as fallback
**Depends on:** Phase 6 (SyncEngine), Phase 11 (infrastructure)
**Requirements:** CONF-01, CONF-02, CONF-03, EXIM-01, EXIM-02
**Success Criteria** (what must be TRUE):
  1. User's `config.json` (with `apiKey` fields stripped) syncs to configured git repo via SyncEngine
  2. Pulled `config.json` has `apiKey` fields stripped on arrival — plaintext never stored in remote (per D-01, D-04)
  3. Setting `yongle.sync.sync_config: false` excludes config from all sync operations (opt-in honored)
  4. Running `/yongle-config export` outputs full config JSON with all apiKey fields excluded (no `--redact` needed — always excluded per D-09)
  5. Running `/yongle-config import <file>` shows dry-run preview and deep-merges into local `config.json` (per D-11, D-12)
**Plans:** 2 plans

### Phase 13: Multi-Device Knowledge Pull & Merge
**Goal:** Knowledge entries from other devices are automatically pulled and merged without data loss
**Depends on:** Phase 12
**Requirements:** SYNC-01, SYNC-02, SYNC-03
**Success Criteria** (what must be TRUE):
  1. Running `/yongle-sync pull` fetches remote knowledge entries and merges them into the local knowledge index
  2. On agent session start, latest knowledge is automatically pulled without requiring a manual sync command
  3. Two devices independently adding entries — after bidirectional sync, both entries exist in both local stores (no data loss)
**Plans:** TBD

### Phase 14: Sync Robustness & Observability
**Goal:** Users are warned of conflicts, can inspect sync status, and background sync keeps knowledge current
**Depends on:** Phase 13
**Requirements:** HRDN-01, HRDN-02, HRDN-03
**Success Criteria** (what must be TRUE):
  1. When local and remote versions of the same entry have diverged, sync warns the user before overwriting either copy
  2. Running `/yongle-sync status` displays last sync timestamp and count of pending local changes not yet pushed
  3. Enabling periodic background sync (configurable interval, e.g. 30 minutes) keeps knowledge current without manual sync commands
**Plans:** TBD

---

## Phases

**Phase 12 plans:**
- [ ] `12-01-PLAN.md` — Config schema, apiKey sanitizer, SyncEngine.syncConfig(), CLI wiring
- [ ] `12-02-PLAN.md` — /yongle-config export + import CLI modules and command routing

- [ ] **Phase 12: Config Sync & Manual Export/Import** — Config sync (apiKeys stripped) + export/import CLI fallback
- [ ] **Phase 13: Multi-Device Knowledge Pull & Merge** — Automatic knowledge pull with conflict-free merge
  - [ ] 13a-PLAN.md — Knowledge Synchronization Script
  - [ ] 13b-PLAN.md — Command Integration & Startup Hook
- [ ] **Phase 14: Sync Robustness & Observability** — Conflict detection, status indicator, background sync

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 12. Config Sync & Manual Export/Import | 2/2 | Complete | 2026-05-24 |
| 13. Multi-Device Knowledge Pull & Merge | 2/2 | Complete | 2026-05-24 |
| 14. Sync Robustness & Observability | 0/– | Not started | – |

## Future Ideas
- **Mobile & Web Sync Viewers**：设计 Git/GitHub 混合冲突合并机制，支持多端经验同步；建立安全的低开销后台 Viewer。
- **多模态图文记忆**：接入多模态图文记忆，识别报错截图并转化为记录。

---
*Roadmap for: AI Agent Skills Library*
*Last updated: 2026-05-20 after Milestone v1.4 roadmap creation*
