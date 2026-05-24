# Requirements: AI Agent Skills 库 (永乐大典)

**Defined:** 2026-05-20
**Core Value:** 让 AI Agent 在日常开发流程中能自主捕捉、学习并沉淀经验

## v1.4 Requirements

### Config Sync

- [x] **CONF-01**: SyncEngine pushes/pulls `config.json` to configured sync repo
- [x] **CONF-02**: `apiKey` fields encrypted before push, decrypted on pull
- [x] **CONF-03**: Config toggle `yongle.sync.sync_config: true/false` controls opt-in

### Export/Import CLI

- [x] **EXIM-01**: `/yongle-config export [--redact]` outputs config JSON (with `--redact` masking API keys)
- [x] **EXIM-02**: `/yongle-config import <file>` deep-merges file into local `config.json`

### Multi-Device Knowledge Sync

- [x] **SYNC-01**: `/yongle-sync pull` fetches and merges remote knowledge from other devices
- [x] **SYNC-02**: Auto-sync on session start — pull latest knowledge when starting work
- [x] **SYNC-03**: Merge strategy for concurrent entries from multiple devices (no data loss)

### Sync Hardening

- [x] **HRDN-01**: Conflict detection — warn when local and remote have diverged
- [x] **HRDN-02**: Sync status indicator — show last sync time, pending changes count
- [x] **HRDN-03**: Periodic background sync option (configurable interval)

## Future Requirements

### TypeScript Migration
- **TS-01**: Refactor core `yongle-dadian/scripts/` from JS to TypeScript

### Multi-Device Sync Extensions
- **SYNC-04**: Cross-device sync viewer (lite web viewer for knowledge entries)
- **SYNC-05**: Mobile-friendly knowledge browser

## Out of Scope

| Feature | Reason |
|---------|--------|
| 重型全功能管理后台 | 保持 local-first 与 Markdown-centric |
| 非代码/非开发通用闲聊 | 聚焦 AI Agent 开发编程提效场景 |
| Notion API driver | 已预留适配器接口，未来可接入 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CONF-01 | Phase 12 | Complete |
| CONF-02 | Phase 12 | Complete |
| CONF-03 | Phase 12 | Complete |
| EXIM-01 | Phase 12 | Complete |
| EXIM-02 | Phase 12 | Complete |
| SYNC-01 | Phase 13 | Complete |
| SYNC-02 | Phase 13 | Complete |
| SYNC-03 | Phase 13 | Complete |
| HRDN-01 | Phase 14 | Complete |
| HRDN-02 | Phase 14 | Complete |
| HRDN-03 | Phase 14 | Complete |

**Coverage:**
- v1.4 requirements: 10 total
- Mapped to phases: 10 ✓
- Unmapped: 0

---
*Requirements defined: 2026-05-20*
*Last updated: 2026-05-20 after Milestone v1.4 roadmap creation*
