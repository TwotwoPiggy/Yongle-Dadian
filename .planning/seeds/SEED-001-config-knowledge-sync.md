---
id: SEED-001
status: harvested
harvested_in: Milestone v1.4
planted: 2026-05-20
planted_during: Milestone v1.3 (post-completion)
trigger_when: next milestone planning
scope: medium
---

# SEED-001: Multi-Device Config & Knowledge Sync

## Why This Matters

User works across multiple devices (work PC, personal PC, server). Config (`config.json` with API keys, proxy settings, model providers) and knowledge base need to stay in sync. Currently knowledge sync exists via `SyncEngine` (Phase 6) but config is local-only, requiring manual re-setup per device.

## When to Surface

**Trigger:** next milestone planning

Surface during `/gsd-new-milestone` when planning the next milestone after v1.3.

## Scope Estimate

**Medium** — a phase or two, needs planning.

## Components

### 1. Git-Based Config Sync (Primary)
- Extend `SyncEngine` to include `config.json` in the sync repo
- Add encryption layer for `apiKey` fields (encrypt before push, decrypt on pull)
- Config toggle: `yongle.sync.sync_config: true/false`

### 2. Export/Import CLI (Fallback)
- `/yongle-config export [--redact]` → outputs sanitized JSON (API keys masked)
- `/yongle-config import <file>` → deep-merges into local `config.json`
- Works offline, USB transfer, no git dependency

### 3. Knowledge Sync Hardening (Nice-to-Have)
- Conflict resolution for concurrent edits across devices
- Sync status indicators

## Breadcrumbs

- `yongle/sdk/src/sync-engine.ts` — existing SyncEngine (knowledge-only)
- `yongle-dadian/scripts/yongle-config.js` — config loader/merger
- `.planning/todos/pending/2026-05-19-yongle-config-import-export.md` — original captured todo
- `.planning/phases/06-sync-cloud-push/` — Phase 6 implementation of knowledge sync
- `yongle/sdk/src/config.ts` — config schema with `yongle.sync` section

## Notes

Promoted from todo `2026-05-19-yongle-config-import-export` during 2026-05-20 session.
Config sync + knowledge sync should be planned together as a cohesive milestone.
