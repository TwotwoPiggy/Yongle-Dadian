---
phase: 13
wave: 2
depends_on: ["13a-PLAN.md"]
files_modified:
  - commands/sync.md
  - scripts/yongle-sync-hook.js
  - ~/.gemini/antigravity/settings.json
autonomous: true
requirements:
  - SYNC-01
  - SYNC-02
---

# Plan 13b: Command Integration & Startup Hook

<objective>
Integrate the bidirectional sync logic into the `/yongle-sync` command and implement the session startup hook for automatic knowledge pulling.
</objective>

<tasks>
  <task id="13b-1">
    <read_first>
      - D:/Computers/AIDevelop/Tools/Skills/yongle-dadian/commands/sync.md
    </read_first>
    <action>
      Update the existing `/yongle-sync` command routing workflow (`commands/sync.md`).
      It should now invoke the `scripts/yongle-sync-knowledge.js` script to perform the sync. 
      If the user runs `/yongle-sync`, it should trigger the full bidirectional sync.
    </action>
    <acceptance_criteria>
      - `commands/sync.md` instructs the system to run `node scripts/yongle-sync-knowledge.js`.
    </acceptance_criteria>
  </task>

  <task id="13b-2">
    <read_first>
      - D:/Computers/AIDevelop/Tools/Skills/yongle-dadian/scripts/yongle-sync-knowledge.js
    </read_first>
    <action>
      Create `scripts/yongle-sync-hook.js`. This script will be registered as a SessionStart hook.
      It should load `yongle-sync-knowledge.js` and call a `pullOnly()` function, OR just call `syncKnowledge()` but suppressing any push operations if we only want to pull on startup. Let's modify `syncKnowledge(options)` in task 13a to accept `{ pullOnly: true }` and have the hook call it that way.
      If a failure occurs, it should `console.warn` the error (as per D-03: output a warning but don't block the agent flow).
    </action>
    <acceptance_criteria>
      - `scripts/yongle-sync-hook.js` exists and executes `syncKnowledge({ pullOnly: true })` (or equivalent).
      - It catches errors and outputs `⚠ 知识库同步失败: ...`.
    </acceptance_criteria>
  </task>

  <task id="13b-3">
    <read_first>
      - C:/Users/Lemony/.gemini/antigravity/settings.json
    </read_first>
    <action>
      Instruct the agent to update `C:/Users/Lemony/.gemini/antigravity/settings.json` to include the SessionStart hook.
      The hook should execute `node D:/Computers/AIDevelop/Tools/Skills/yongle-dadian/scripts/yongle-sync-hook.js`.
      (Note: If the executor cannot modify `settings.json` directly due to path restrictions, it should output instructions for the user).
    </action>
    <acceptance_criteria>
      - `settings.json` is modified or instructions are provided to add the `SessionStart` hook.
    </acceptance_criteria>
  </task>
</tasks>

<verification>
  - Ensure `/yongle-sync` triggers the knowledge sync.
  - Verify that `yongle-sync-hook.js` runs without crashing the process on failure.
</verification>

<must_haves>
  <truth>The /yongle-sync command must trigger the bidirectional sync.</truth>
  <truth>A startup hook must exist to trigger an auto-pull when the agent starts.</truth>
</must_haves>
