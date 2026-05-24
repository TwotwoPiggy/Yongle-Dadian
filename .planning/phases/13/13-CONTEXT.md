# Phase 13: Multi-Device Knowledge Pull & Merge - Context

**Gathered:** 2026-05-24
**Status:** Ready for planning

## Phase Boundary

<domain>
Implement bidirectional knowledge sync: pull remote knowledge entries from other devices, merge without data loss, rebuild local indexes, and push local entries back. Auto-pull on agent session start ensures freshness.
</domain>

## Implementation Decisions

### Index Rebuild After Pull
- **D-01:** After pulling new entries, run full `reindex.js` (SQLite upsert) + `yongle-embed-all.js` (vector embedding). Both tools are idempotent — SQLite uses ON CONFLICT DO UPDATE, embed-all skips entries with existing vectors. Full invocation ≈ effective incremental.

### Auto-Pull Trigger
- **D-02:** Auto-pull triggers on agent session start (registered as a startup hook). Ensures every new conversation starts with the latest knowledge.
- **D-03:** Pull failure (offline/no remote) outputs a single warning line (e.g., `⚠ 知识库同步失败: [reason]`) but does NOT block the agent flow. Local cache continues working.

### Multi-Device Merge Strategy
- **D-04:** File-granularity + `git pull --rebase`. Each `.md` entry is an independent file with unique `YYYYMMDD-HHMMSS-slug.md` naming — new entries from different devices never conflict. For the rare case of same-file modification conflicts: attempt rebase, on failure abort and create `.conflict-<device>.md` copies of both versions for manual resolution.
- **D-05:** Knowledge sync uses bidirectional mode: `pull --rebase → reindex/embed → push`. A single `/yongle-sync` command does the full roundtrip, preventing data loss by always pulling before pushing.

### Sync Scope (carried from Phase 12)
- **D-06 (Phase 12 D-08):** Sync scope is global knowledge only (`~/.yongle_knowledge/`). Project-level `.planning/` is NOT synced.
- **D-07 (Phase 12 D-04):** API keys are never transmitted — stripped before any push operation.

### Agent's Discretion
- Hook registration mechanism (settings.json structure for session-start pull)
- Rebase conflict detection and `.conflict-*` file creation logic
- Error message formatting for pull failures
- Whether to sync `INDEX.md`, `query_cache.json`, and other derived files (recommend: skip them, they are regenerated locally)

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Requirements
- `.planning/ROADMAP.md` §Phase 13 — Goal, success criteria (SYNC-01, SYNC-02, SYNC-03)
- `.planning/REQUIREMENTS.md` §SYNC-01-03 — Detailed requirements
- `.planning/PROJECT.md` — Project context and constraints

### Existing Sync Infrastructure (from Phase 12)
- `scripts/yongle-sync-config.js` — Git-based config push/pull with apiKey protection (pattern to follow for knowledge sync)
- `scripts/yongle-config-import.js` — Interactive merge with dry-run preview
- `scripts/yongle-config-sanitizer.js` — apiKey stripping utility
- `commands/sync.md` — /yongle-sync command routing (extend for knowledge pull)
- `commands/sync-config.md` — /yongle-sync-config command (reference pattern)

### Knowledge Storage & Indexing
- `scripts/reindex.js` — SQLite index rebuild from Markdown files (idempotent upsert)
- `scripts/yongle-embed-all.js` — Batch embedding generation (incremental, skips existing)
- `scripts/yongle-db.js` — SQLite database operations (init, upsert, query)
- `scripts/yongle-lancedb.js` — LanceDB vector store operations
- `scripts/yongle-config.js` — `loadMergedConfig`, `deepMerge`, `globalConfigPath`

### Prior Phase Context
- `.planning/phases/12/12-CONTEXT.md` — Phase 12 decisions (config sync, apiKey protection)
- `.planning/phases/12/12-01-SUMMARY.md` — Config export/import implementation
- `.planning/phases/12/12-02-SUMMARY.md` — Config sync via git implementation

## Existing Code Insights

### Reusable Assets
- **yongle-sync-config.js**: Follow the same `isGitRepo()` → `pushConfig()` / `pullConfig()` pattern for knowledge sync
- **reindex.js**: Call as-is after pulling new entries — handles full directory scan + upsert
- **yongle-embed-all.js**: Call as-is after reindex — auto-detects entries missing vectors
- **deepMerge** (yongle-config.js): Available for any config-level merge needs

### Established Patterns
- **Git push with apiKey protection** (Phase 12): backup → sanitize → commit → push → restore
- **try...finally for local state restoration** (yongle-sync-config.js): Ensures local config integrity even on push failure
- **BOM stripping** (yongle-config-import.js): `content.replace(/^\uFEFF/, '')` for Windows PowerShell compatibility
- **Idempotent operations**: Both reindex and embed-all are safe to run repeatedly

### Integration Points
- **Settings hooks** (`~/.gemini/antigravity/settings.json`): SessionStart hooks array — register auto-pull here
- **Sync repo** (`~/.yongle_knowledge/`): Same git repo for both config and knowledge entries
- **Command routing** (`commands/sync.md`): Add `--pull` / knowledge pull support

### Knowledge File Structure
- `~/.yongle_knowledge/*.md` — Knowledge entries with YAML frontmatter (id, date, tags, resolution_type, cause_summary)
- `~/.yongle_knowledge/yongle.db` — SQLite FTS index
- `~/.yongle_knowledge/vector_store.lance/` — LanceDB vector index
- `~/.yongle_knowledge/config.json` — Global config (synced separately in Phase 12)
- `~/.yongle_knowledge/INDEX.md` — Entry index (derived, should not sync)
- `~/.yongle_knowledge/query_cache.json` — Query cache (derived, should not sync)

## Deferred Ideas

None — discussion stayed within phase scope.

---

*Phase: 13-Multi-Device Knowledge Pull & Merge*
*Context gathered: 2026-05-24*
