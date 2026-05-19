<purpose>
知识库索引重构引擎。扫描目标目录下的所有知识条目，同步元数据至 SQLite 数据库。
</purpose>

<process>

**Step 1: 环境准备**

1. 解析参数 `$ARGUMENTS` 确定 `$SCOPE` (默认为 `global`，可选 `local`)。
2. 确定目标目录 `$TARGET_DIR`：
   - `local` -> `.planning/knowledge/`
   - `global` -> `~/.yongle_knowledge/`

---

**Step 2: 索引重构**

调用 Node.js 索引重建引擎：
```bash
node yongle-dadian/scripts/reindex.js "$SCOPE"
```

该脚本将自动执行以下操作：
1. 递归扫描 `$TARGET_DIR` 下的所有有效 `.md` 经验文件。
2. 解析 Markdown 的 YAML Frontmatter。
3. 清理数据库，并通过 Stdin 管道流（避免 Windows 命令行转译和字符限制）批量插入或更新数据到 `yongle.db`。

---

**Step 3: 结果呈现**

脚本执行完成后，终端会直接输出索引文件总数和成功状态，整个过程已在后台完成。

</process>

<notes>
- 索引过程会覆盖已有记录（UPSERT），保证 DB 与 FS 同步。
- 如果文件不包含有效的 Frontmatter，或者没有 `id` 属性，则会自动跳过。
</notes>
