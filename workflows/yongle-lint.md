<purpose>
对永乐大典知识库执行健康巡检与自愈体检。排查 Frontmatter 破损、未索引孤儿条目、数据库幽灵记录、[[wikilinks]] 死链以及向量高相似度语义冲突，防止知识库腐化（Wiki Rot）。
</purpose>

<process>

**Step 1: 解析运行参数**

解析 `$ARGUMENTS` 提取运行级别与选项：
- `--local` / `--project` → 仅巡检当前项目级知识库
- `--global` / `--user` → 仅巡检用户级知识库
- `--deep` → 开启 Layer 2 深度语义审计（检测潜在语义重复）
- `--fix` → 自动修复确定性格式与索引异常

若未指定级别，默认使用 `auto` 级（检查所有可用知识库）。

---

**Step 2: 执行健康巡检**

在终端运行核心巡检脚本：
```bash
node scripts/yongle-lint.js "$LEVEL" ${DEEP:+--deep} ${FIX:+--fix}
```

**巡检两大层级细节**：
1. **Layer 1: 确定性结构体检（毫秒级）**：
   - 检查 YAML Frontmatter 围栏是否完好；
   - 检查必填元数据字段（`id`, `date`, `resolution_type`, `cause_summary`, `tags`）；
   - 检查物理 Markdown 存在但 SQLite 未收录的“孤儿条目”；
   - 检查数据库中登记但磁盘文件已被删除的“幽灵记录”；
   - 检查正文中 `[[KI-xxxx]]` 引用目标是否存在（死链）；
   - 检查滞留未确认的长期草稿。

2. **Layer 2: 深度语义审计（需 `--deep`）**：
   - 利用本地向量数据库 LanceDB 扫描余弦距离极近但未关联的潜在冲突/重复条目；
   - 审计标记为 `deprecated` 但未提供 `superseded_by` 替代方案的孤立废弃条目。

---

**Step 3: 诊断报告与修复决策**

若扫描发现问题且未带 `--fix` 参数：
向用户呈现诊断结果，并通过 `AskUserQuestion` 询问是否自动修复：

```
AskUserQuestion(
  header: "永乐大典 — 健康体检结果",
  question: "巡检发现了格式/索引隐患，是否执行自动修复？",
  options: [
    { label: "🔧 执行自动自愈修复 (--fix)", description: "补齐缺失的基础元数据字段、重新挂载孤儿条目并清理幽灵记录" },
    { label: "🔍 仅查看，暂不修改", description: "保留现状，稍后手动审阅" }
  ],
  multiSelect: false
)
```

若用户选择执行修复，调用：
```bash
node scripts/yongle-lint.js "$LEVEL" --fix
```

---

**Step 4: 巡检完成**

输出健康度总结与防护建议：
- 知识库索引与物理文件完全一致；
- 建议定期执行 `/yongle-lint` 保持研发知识资产的高质量与可检索性。

</process>
