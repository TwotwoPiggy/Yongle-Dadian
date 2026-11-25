<purpose>
永乐大典（Yongle Dadian）复盘引擎。在 AI 辅助开发过程中，当一个 Bug 被解决或某项任务最终跑通后，提取这段对话中的核心错误信息、调试过程与解决方案，将其凝练为结构化的知识条目并支持一步直达直接归档（或按需存为草稿）。
</purpose>

<knowledge_schema>
每份知识条目必须包含以下6个 YAML Frontmatter 字段（缺少任何一个均视为无效条目）：

```yaml
---
id: "<YYYYMMDD>-<kebab-case-summary>"          # 唯一ID，如: 20260418-dotnet-ef-migration-fail
date: "<YYYY-MM-DD>"                            # 记录日期
resolution_type: "<类型>"                       # 分类: bug-fix | config-fix | api-change | env-issue | logic-error | other
tags:                                           # 技术栈与领域标签
  - "<tag1>"
  - "<tag2>"
host_agent: "<Agent名称>"                       # 执行解决方案的AI Agent: antigravity | copilot | codex | cursor | claude | other
cause_summary: "<一句话精炼根因>"               # 30字以内，直接说明问题本质
---
```
</knowledge_schema>

<process>

**Step 1: 解析启动参数与配置**

解析 `$ARGUMENTS`：
- `--global` → 归档目标为 `~/.yongle_knowledge/`（默认）
- `--local` / `--project` → 归档目标为当前项目的 `.planning/knowledge/`
- `--model <name>` → 覆盖分析时使用的模型名称（仅作记录，实际由宿主Agent调度）
- `-y` / `--yes` → 免交互直接归档模式

若未指定 scope，默认使用 `--global`。

确定归档路径（存储为 `$ARCHIVE_DIR`）：
```bash
# Windows PowerShell / Bash 兼容处理
node -e "const fs = require('fs'); const dir = process.argv[1]; if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });" "$ARCHIVE_DIR"
```

检测是否启用免交互自动归档：
- 启动参数中包含 `-y` 或 `--yes`
- 或全局配置 `~/.yongle_knowledge/config.json` 中 `yongle.postmortem.auto_confirm` 为 `true`
- 或环境变量 `YONGLE_TEST_MODE` 为 `"true"`
若满足以上任一条件，标记 `AUTO_ARCHIVE=true`。

---

**Step 2: 双阶段思维链分析 (Two-Step CoT Pipeline)**

显示分析提示：
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 永乐大典 ▶ 正在启动双阶段思维链复盘流水线...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

为了彻底消除单次 Prompt 提炼导致的"因果幻觉"与"归因草率"，并完整保留最珍贵的"踩坑与负面尝试记录"，执行严格的双阶段分析：

#### 【Stage 1: Reasoning Pass — 事实归因与试错沉淀】
先不急于输出任何 YAML/JSON 结构，进行深度纯文本推导与事实求证：
1. **检查活跃追踪 (WATCHING.md)**:
   - 若存在 `.planning/yongle/WATCHING.md`，将其作为最高优先级真实轨迹基准，提取 Timeline。
2. **定位问题边界与验证状态**:
   - 提取最初的报错现场、关键堆栈与具体复现条件。
   - **真实解决门禁（Unsolved Gate）**：检查任务是否真正解决。若属于"绕过/放弃/用假数据糊弄/未验证"状态，严禁草率归档，应提示用户停止本次提炼。
3. **失败尝试还原（Negative Trials）**:
   - 详细梳理中途尝试了哪些方向？为什么前面几次失败了？（失败尝试与避坑指南具有同等甚至更高价值）。
4. **物理/逻辑本质根因推导**:
   - 探究引起故障的底层机制，而非表面症状。
   - 明确哪一次操作、哪几行代码改动最终使系统恢复正常。

#### 【Stage 2: Compilation Pass — 结构化编译与元数据对齐】
基于 Stage 1 得出的事实推导结果，编译输出规范的标准化知识文档：
1. **提炼结构化章节**:
   - **问题根因（Root Cause）**：一句话直击要害。
   - **调试历程（Debug Path）**：完整包含尝试清单与失败分支分析。
   - **最终解决方案（Resolution）**：经过验证的清晰操作步骤与代码。
   - **防复发建议（Prevention）**：工程防御与配置防护建议。
2. **对齐 6 大规范元数据**:
   - 推断 `resolution_type` (bug-fix | config-fix | api-change | env-issue | logic-error | other)
   - 提取精确技术栈 `tags`
   - 记录 `host_agent` 与当前日期 `date`
   - 生成符合规范的 `id`（`YYYYMMDD-<kebab-cause-summary>`）

#### 【Stage 3: 查重与原地演进嗅探 (Duplicate Sniffing)】
1. 以提取的核心错误信息与 `cause_summary` 在 SQLite/向量库中执行嗅探检索。
2. 若命中高重合度条目：
   - 标记 `IS_DUPLICATE=true`，获取目标条目 ID（如 `$TARGET_KI`）与历史记录。
   - 预设演进策略：
     - 若旧方案仍有效但需版本/环境增量 → 推荐 `supplement`（原地补充）
     - 若旧方案已彻底过时被推翻 → 推荐 `supersede`（推翻废弃旧方案）
     - 否则为 `create_new`（独立新建）

---

**Step 3: 展示提炼结果与单步确认（一步直达）**

在落盘前，向用户展示提炼摘要：
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 永乐大典 ▶ 分析完成，准备归档
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋  ID:          {id}
📅  日期:        {date}
🏷️  分类:        {resolution_type}
🔖  标签:        {tags}
🤖  记录Agent:   {host_agent}
💡  根因摘要:    {cause_summary}
```

若嗅探到高重合度的历史条目，展示原地演进预警：
```
⚠️ 发现潜在重合的历史条目: [{target_ki}] {target_summary}
🔄 建议演进策略: {suggested_strategy} (supplement 原地补充 / supersede 推翻废弃)
```

> [!IMPORTANT]
> **AUTOMATION HOOK**: 若 `AUTO_ARCHIVE` 为 `true`，直接打印 `⚡ 已启用 auto_confirm / 免交互模式，正在直接归档...`，跳过询问直接进入 **Step 4（正式归档）**。

若未启用免交互，调用交互询问（一步确认）：
```
AskUserQuestion(
  header: "永乐大典 — 归档确认",
  question: "复盘提炼已完成，请选择归档方式与演进策略：",
  options: [
    { label: "✅ 确认并直接归档", description: "按预设策略写入正式知识库并更新索引（推荐，一步搞定）" },
    { label: "🔄 原地增量补充 (supplement)", description: "向关联的历史旧条目追加版本迭代小节，更新修改时间" },
    { label: "⚠️ 推翻旧案并归档 (supersede)", description: "将历史旧条目标记为 deprecated 废弃，并与新条目互相关联" },
    { label: "📝 存为草稿稍后编辑", description: "生成 .draft.md，保留草稿以便后续手动精修" },
    { label: "✏️ 修改根因摘要", description: "对 cause_summary 进行微调后再确认" },
    { label: "🏷️ 修改标签/分类", description: "对 tags 或 resolution_type 进行调整" },
    { label: "❌ 取消", description: "放弃本次复盘，不保存任何内容" }
  ],
  multiSelect: false
)
```

- **若用户选择 "✅ 确认并直接归档"** 或根据策略选择：进入 **Step 4**，调用 `confirmDraft` 或原地写入。
- **若用户选择 "📝 存为草稿稍后编辑"**：进入 **Step 5**。
- **若用户选择 "修改根因摘要" 或 "修改标签/分类"**：用文本跟进问题收集修改内容，更新相应字段后重新展示确认。
- **若用户选择 "取消"**：打印 `已取消归档。` 并退出流程。

---

**Step 4: 正式归档（默认与推荐分支）**

生成正式文件名（无需生成与删除草稿）：
```bash
# 生成跨平台兼容的时间戳
TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
FINAL_FILENAME="${TIMESTAMP}-${SLUG}.md"
FINAL_PATH="${ARCHIVE_DIR}/${FINAL_FILENAME}"
```

1. **写入正式知识条目**：
   知识条目无需包含 `draft: true` 标记，格式如下：
```markdown
---
id: "{id}"
date: "{date}"
resolution_type: "{resolution_type}"
tags:
{tags_yaml_list}
host_agent: "{host_agent}"
cause_summary: "{cause_summary}"
---

# {一句话标题}

## 问题根因

{root_cause_detailed}

## 调试历程

{debug_path_with_failed_attempts}

## 最终解决方案

{resolution_steps}

## 防复发建议

{prevention_tips}

---
*本文档由永乐大典自动生成并归档。*
*Generated: {datetime}*
```

2. **处理分类与长期记忆**：
   识别知识条目中的内容：
   - 若包含 **风格 (Style)**、**思维模式 (Thoughts)** 或 **通用模式 (Patterns)**：将对应片段同步至 `~/.yongle_knowledge/memory/` 下的对应分类，并更新 `memory/INDEX.json`。
   - 核心知识条目存入 `$ARCHIVE_DIR`。

3. **清理活跃追踪文件**：
   ```bash
   if [ -f ".planning/yongle/WATCHING.md" ]; then
     rm ".planning/yongle/WATCHING.md"
   fi
   ```

4. **更新或初始化索引（INDEX.md 与 SQLite）**：
   ```bash
   INDEX_PATH="${ARCHIVE_DIR}/INDEX.md"
   
   # 如果索引不存在，先初始化表头
   if [ ! -f "$INDEX_PATH" ]; then
     echo "# 永乐大典知识索引" > "$INDEX_PATH"
     echo "" >> "$INDEX_PATH"
     echo "| 日期 | 条目ID | 分类 | 根因摘要 | 标签 |" >> "$INDEX_PATH"
     echo "|------|--------|------|----------|------|" >> "$INDEX_PATH"
   fi

   # 追加新条目摘要行
   echo "| {date} | [{id}](./${FINAL_FILENAME}) | {resolution_type} | {cause_summary} | {tags_inline} |" >> "$INDEX_PATH"

   # 更新 SQLite 索引
   node yongle/scripts/yongle-db.js upsert "$SCOPE" "$DATA_JSON"
   ```

5. **展示完成横幅**：
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 永乐大典 ▶ 归档完成 ✅
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📚 已归档: {FINAL_PATH}
📋 索引已更新: {INDEX_PATH}
```

6. **后台静默同步与向量化（可选）**：
```bash
# 检查是否开启了自动同步模式
SYNC_MODE=$(node "d:\Computers\AIDevelop\Tools\Skills\yongle-dadian\sdk\srcconfig-get.ts" yongle.sync.mode 2>/dev/null || echo "manual")
if [ "$SYNC_MODE" = "auto" ] || [ "$SYNC_MODE" = "both" ]; then
  echo "正在执行后台静默同步..."
  node "d:\Computers\AIDevelop\Tools\Skills\yongle-dadian\sdk\src\sync-cli.ts" --scope=all > /dev/null 2>&1 &
fi
```

提示完成：`下次遇到类似问题，可用 /yongle-search 快速检索。`

---

**Step 5: 存为草稿分支（仅在用户主动选择存草稿时触发）**

若用户在 Step 3 选择 "📝 存为草稿稍后编辑"：

1. **写入草稿文件**：
   生成文件名 `${TIMESTAMP}-${SLUG}.draft.md`，并在 Frontmatter 中加入 `draft: true` 标记。
   将内容写入 `${ARCHIVE_DIR}/${TIMESTAMP}-${SLUG}.draft.md`。

2. **提示用户**：
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 永乐大典 ▶ 草稿已保存 📝
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📄 草稿路径: {DRAFT_PATH}

草稿已妥善保存。您可在编辑器中进行审阅与精修。
精修完成后，运行以下命令即可正式归档：

  /yongle-confirm {DRAFT_PATH}
```

</process>

<notes>
- 默认采用一步直达归档机制，单次确认即直接落盘，极大降低交互摩擦
- 依然保留“存为草稿”分支，满足需要精细化人工修订的高定制场景
- 支持 auto_confirm 配置与 -y / --yes 参数，满足全自动流水线或工兵调用需求
- 上下文回溯由宿主大模型（如 Antigravity、VS Code Copilot、Claude Code）直接执行，无需额外 API 开销
- 所有文件写入操作均通过系统工具（Bash/Write）完成，不依赖多余 npm 包
</notes>
