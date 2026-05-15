<purpose>
手动/被动召回个人库记忆。通过查阅两层索引（INDEX.json）并加载具体的 .md 记忆文件，实现 Agent 的实时风格纠偏与决策对齐。
</purpose>

<process>

**Step 1: 索引查阅**

1. **定位记忆库**：
   - 优先检查本地项目：`.planning/yongle/memory/`
   - 其次检查全局配置：`~/.yongle_knowledge/memory/`

2. **读取 `INDEX.json`**：
   展示可用的记忆类别（style, decisions, patterns, thoughts）。

---

**Step 2: 匹配与加载**

1. **确定召回对象**：
   - 若提供了参数（如 `style/code`），则直接匹配相关文件。
   - 若未提供参数且属于被动触发，则由大模型分析当前“违和感”所在，从索引中挑选最相关的 1-3 条记忆。

2. **内容拉取**：
   读取选中的 `.md` 文件内容。

---

**Step 3: 归并与确认**

1. **效果预览**：
   显示：“已找到相关记忆碎片：{topic_name}。正在应用到当前上下文...”

2. **上下文对齐**：
   Agent 将读取的记忆内容作为 `system_instruction` 的补充或 `context` 注入，并给出响应反馈：“我已复习了关于 {topic_name} 的要求，接下来的输出将遵循该风格。”

---

**Step 4: 反馈总结 (可选)**

若用户对召回的记忆有异议，记录修改意见，以便在下一次“长梦”中更新该记忆条目。

</process>

<notes>
- 索引应当包含 Topic 的简要描述（Summary），以便大模型在不读取全文的情况下选择。
- 区分本地 vs 全局，避免项目特定的决策污染全局风格。
</notes>
