# Phase 13: Multi-Device Knowledge Pull & Merge - Research

## 1. Executive Summary
This phase implements bidirectional synchronization of global knowledge (`~/.yongle_knowledge/`) across multiple devices. Based on Phase 12's Git-based sync patterns, we will introduce `pullConfig()` (to be generalized as `pullRepo()`) and integrate it with index rebuilding logic (`reindex.js` and `yongle-embed-all.js`). A startup hook will ensure the agent fetches the latest knowledge when starting.

## 2. Existing Code Analysis
* **Git Operations:** `scripts/yongle-sync-config.js` currently contains `pushConfig()`. We need to extract the underlying git commands (`git add`, `git commit`, `git push`) into reusable functions or add a `pullConfig()` (or more accurately, `pullKnowledge()`) function that performs `git pull --rebase`.
* **Conflict Resolution:** `git pull --rebase` automatically handles most file-level merges (since knowledge entries are uniquely named). If there are conflicts (same file modified), the script must detect them, abort the rebase (`git rebase --abort`), and ideally preserve both versions.
* **Index Rebuilding:** 
    * `scripts/reindex.js`: Rebuilds the SQLite database from `.md` files. It handles `ON CONFLICT DO UPDATE`, making it idempotent and safe to run after a pull. It can be invoked via `node reindex.js`.
    * `scripts/yongle-embed-all.js`: Generates LanceDB embeddings. It's incremental (skips existing vectors). It expects `global` or `local` as an argument (`node scripts/yongle-embed-all.js global`).
* **Command Routing:** The `skills/yongle-sync/SKILL.md` points to `workflows/yongle-sync.md` which doesn't exist yet. We need to create this workflow to orchestrate the pull -> reindex -> embed -> push flow.
* **Startup Hook:** `~/.gemini/antigravity/settings.json` is not directly managed by this project, but we can instruct the user on how to add a `SessionStart` hook or we can add a script that registers it if the CLI provides an API. For this phase, we will implement the core command and document the hook registration.

## 3. Technical Approach
1. **Extend Git Utilities:** Refactor `scripts/yongle-sync-config.js` (or create `scripts/yongle-sync.js`) to support `pullRebase()`.
2. **Implement Sync Orchestrator:** Create `workflows/yongle-sync.md` to define the sequence:
   * Sanitize API keys (reuse Phase 12 logic)
   * `git pull --rebase`
   * Run `node scripts/reindex.js`
   * Run `node scripts/yongle-embed-all.js global`
   * `git push`
3. **Handle Sync Failures:** Implement logic to catch pull/push errors and output appropriate warnings without crashing the overall process.
4. **Update `.gitignore`:** Ensure `~/.yongle_knowledge/.gitignore` excludes `yongle.db`, `vector_store.lance/`, `config.json` (synced separately/differently depending on decisions), `INDEX.md`, and `query_cache.json`. *Wait, D-06 says Sync scope is global knowledge only. We should make sure the global repo ignores local DBs.*

## 4. Risk Assessment
* **Rebase Conflicts:** Although rare, conflicts during `git pull --rebase` could leave the git repo in a detached/rebase state. We must ensure robust `git rebase --abort` on error.
* **API Key Leakage:** We must ensure the API key sanitizer runs *before* any git commits happen during the sync process. Phase 12 handled this for config; we need to ensure knowledge files don't accidentally contain keys (though less likely than config).
* **Performance:** Running `yongle-embed-all.js` could be slow if there are many new entries, but its concurrency limit (5) mitigates memory issues.

## 5. File Inventory
* **Modify:** `scripts/yongle-sync-config.js` (or create a new `scripts/yongle-sync.js`)
* **Create:** `workflows/yongle-sync.md`
* **Create:** `scripts/yongle-sync-hook.js` (for the auto-pull on startup)
* **Modify:** `~/.yongle_knowledge/.gitignore` (to ensure DBs aren't tracked)

## RESEARCH COMPLETE
