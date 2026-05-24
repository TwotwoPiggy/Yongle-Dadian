---
phase: 13
wave: 1
depends_on: []
files_modified:
  - scripts/yongle-sync-knowledge.js
  - ~/.yongle_knowledge/.gitignore
autonomous: true
requirements:
  - SYNC-01
  - SYNC-03
---

# Plan 13a: Knowledge Synchronization Script

<objective>
Implement the core bidirectional sync logic for knowledge entries (`scripts/yongle-sync-knowledge.js`), establishing the `pull --rebase -> reindex -> embed -> push` pipeline and configuring `.gitignore` to prevent tracking of local indexes.
</objective>

<tasks>
  <task id="13a-1">
    <read_first>
      - D:/Computers/AIDevelop/Tools/Skills/yongle-dadian/scripts/yongle-sync-config.js
      - D:/Computers/AIDevelop/Tools/Skills/yongle-dadian/.planning/phases/13/13-CONTEXT.md
    </read_first>
    <action>
      Create a script `scripts/yongle-sync-knowledge.js` that implements the bidirectional sync logic.
      The script should export a `syncKnowledge()` function that performs the following:
      1. Define `KNOWLEDGE_DIR` as `~/.yongle_knowledge`.
      2. Check if it's a git repo (`git status`).
      3. Commit any uncommitted local `.md` files (using a generic message like "docs: local knowledge snapshot"). Note: Ignore `config.json` and `config.remote.json` here if they are handled by config sync, or let them be if they are safe. Wait, `config.json` needs sanitization. Actually, the phase decision D-06/D-07 says API keys must be stripped. We should probably reuse `yongle-config-sanitizer.js` to strip `config.json` before committing if we are syncing it here. Or, since Phase 12 already handles config sync via `/yongle-sync-config`, perhaps this script *only* syncs `.md` files. Let's explicitly stage only `*.md` files: `git add "*.md"`.
      4. Execute `git pull --rebase`.
      5. Catch pull failures. If it's a merge conflict, execute `git rebase --abort`, create conflict markers or `.conflict` copies if possible (or just log the failure and return), and throw an error with the `⚠ 知识库同步失败` warning format (D-03).
      6. If pull is successful (or no changes), call `node scripts/reindex.js global`.
      7. Call `node scripts/yongle-embed-all.js global`.
      8. Execute `git push`.
    </action>
    <acceptance_criteria>
      - `scripts/yongle-sync-knowledge.js` exists and exports `syncKnowledge()`.
      - The sync function attempts a `git pull --rebase` before `git push`.
      - The script invokes `reindex.js` and `yongle-embed-all.js` upon successful pull.
      - Pull failures throw an error containing the string "知识库同步失败".
    </acceptance_criteria>
  </task>

  <task id="13a-2">
    <read_first>
      - D:/Computers/AIDevelop/Tools/Skills/yongle-dadian/.gitignore
    </read_first>
    <action>
      Create or update the `.gitignore` file within the global knowledge directory (`~/.yongle_knowledge/.gitignore`).
      It must exclude derived indexes and caches:
      - `yongle.db`
      - `yongle.db-shm`
      - `yongle.db-wal`
      - `vector_store.lance/`
      - `INDEX.md`
      - `query_cache.json`
      - `failed_embeddings.log`
      
      This can be done by having `scripts/yongle-sync-knowledge.js` check for and write this `.gitignore` file at the beginning of its execution if it doesn't exist.
    </action>
    <acceptance_criteria>
      - Running `syncKnowledge()` ensures `~/.yongle_knowledge/.gitignore` exists and contains entries for `yongle.db` and `vector_store.lance/`.
    </acceptance_criteria>
  </task>
</tasks>

<verification>
  - Ensure `syncKnowledge()` can be required in a Node REPL.
  - Inspect the generated `.gitignore` in `~/.yongle_knowledge/`.
</verification>

<must_haves>
  <truth>The sync script must pull before pushing.</truth>
  <truth>The sync script must invoke reindex and embed-all after a successful pull.</truth>
</must_haves>
