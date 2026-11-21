<purpose>
将永乐大典草稿（.draft.md）正式归档。支持直接指定文件路径，或者在未指定时自动扫描并列出所有草稿供用户选择。全面支持吸收 LLM Wiki 思想的原地演进合流（create_new 独立新建、supplement 原地补充追加、supersede 推翻废弃旧案）。
</purpose>

<process>

**Step 1: 环境与参数准备**

解析 `$ARGUMENTS` 提取 `$DRAFT_PATH` 及演进选项（如 `--strategy`、`--target`、`--note`）。

确定知识库根路径：
```bash
# Windows PowerShell 兼容处理: $HOME 为空时回退到 $USERPROFILE
HOME_DIR="${HOME:-$USERPROFILE}"
ARCHIVE_DIR="${HOME_DIR}/.yongle_knowledge"
```

---

**Step 2: 确定目标草稿**

若 `$DRAFT_PATH` 为空：
1. **扫描所有草稿**：
   ```bash
   ls "${ARCHIVE_DIR}/drafts"/*.md 2>/dev/null || ls "${ARCHIVE_DIR}"/*.draft.md 2>/dev/null
   ```

2. **提示用户选择**：
   - 若无草稿，提示 `未找到待归档的草稿文件。` 并退出。
   - 若有草稿，使用 `AskUserQuestion` 展示草稿列表。

若 `$DRAFT_PATH` 不为空，验证文件是否存在。

---

**Step 3: 审阅与确认**

读取草稿文件的 Frontmatter 信息（`id`, `date`, `resolution_type`, `cause_summary`, `evolution_strategy`, `target_ki`, `conflict_note`）展示给用户。

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 永乐大典 ▶ 准备归档草稿
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📄 路径:     {DRAFT_PATH}
📋 ID:       {id}
📅 日期:     {date}
🏷️ 分类:     {resolution_type}
💡 根因:     {cause_summary}
🔄 演进策略: {evolution_strategy}
🎯 目标条目: {target_ki}
📝 演进说明: {conflict_note}
```

> [!IMPORTANT]
> **AUTOMATION HOOK**: 若 `YONGLE_TEST_MODE` 为 "true" 或全局开启了 `auto_confirm`，自动确认并跳过交互式提示。

若未开启免交互，展示确认选项：
```
AskUserQuestion(
  header: "确认归档",
  question: "请选择如何将此草稿存入知识库：",
  options: [
    { label: "✅ 按预设策略合流归档", description: "根据草稿中的 evolution_strategy 自动执行新建或原地合流" },
    { label: "🔄 强制原地补充 (supplement)", description: "向指定的 target_ki 历史旧条目追加补充更新小节" },
    { label: "⚠️ 强制推翻旧案 (supersede)", description: "将 target_ki 标记为 deprecated 废弃，并与新条目双向关联" },
    { label: "🆕 强制作为全新条目 (create_new)", description: "忽略关联条目，作为独立的新条目归档" },
    { label: "❌ 取消", description: "保留草稿不操作" }
  ],
  multiSelect: false
)
```

---

**Step 4: 执行归档与演进合流**

用户确认后，调用内置 CLI 或核心 API 执行合流：

```bash
node scripts/yongle-confirm.js "$DRAFT_PATH" \
  ${STRATEGY:+--strategy "$STRATEGY"} \
  ${TARGET_KI:+--target "$TARGET_KI"} \
  ${CONFLICT_NOTE:+--note "$CONFLICT_NOTE"}
```

**合流执行细节**：
1. **`create_new`（新建独立条目）**：
   - 移除 `draft: true` 标记；
   - 写入 `${ARCHIVE_DIR}/memory/${id}.md`；
   - 移除原草稿文件；
   - 触发 SQLite 增量扫描与向量化。

2. **`supplement`（原地补充更新）**：
   - 定位 `target_ki` 对应的物理条目；
   - 在旧条目 Frontmatter 中更新 `updated_at`；
   - 在旧条目正文末尾追加 `## 补充演进 (日期)` 小节，包含演进原因与补充方案；
   - 移除临时草稿；
   - 原地更新 SQLite 与 LanceDB 向量数据。

3. **`supersede`（推翻废弃旧条目）**：
   - 定位 `target_ki` 对应的物理条目；
   - 将旧条目 Frontmatter 标记为 `status: deprecated`、`superseded_by: {new_id}`；
   - 在旧条目正文顶部插入 `> [!WARNING] 此方案已废弃` 呼出块并链接到新条目；
   - 将新草稿标记 `status: active`、`supersedes: {target_ki}`，存为正式条目；
   - 移除临时草稿；
   - 刷新旧条目与新条目的 SQLite 与向量数据。

---

**Step 5: 完成提示**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 永乐大典 ▶ 归档完成 ✅
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📚 动作类型: {action}
📁 正式文件: {FINAL_PATH}
📋 数据库索引已更新
💡 检索时将自动自适应最新结论与弃用状态。
```

</process>
