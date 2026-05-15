<purpose>
会话启动时的摘要检查指令。识别是否存在“待归档梦境”（由 yongle-dreamer.js 产生的 buffer），并引导用户将其归并至个人库中。
</purpose>

<process>

**Step 1: 扫描缓冲区**

检查 `.planning/yongle/dream_buffer.jsonl` 是否存在且不为空。
```bash
if [ ! -s ".planning/yongle/dream_buffer.jsonl" ]; then
  echo "当前无待处理梦境。系统记忆已是最新。"
  exit 0
fi
```

---

**Step 2: 提炼梦境摘要**

读取 `dream_buffer.jsonl`，显示过去一段时间内系统观察到的动向。
1. **统计**：有多少个快速梦，多少个长梦。
2. **内容回溯**：回溯自缓冲区最后一条记录的时间点以来的对话。

---

**Step 3: 归档与对齐**

使用 `AskUserQuestion` 询问用户：
```
AskUserQuestion(
  header: "昨梦回顾",
  question: "检测到一段未归档的空闲时间动向，是否现在进行深度总结并更新个人库？",
  options: [
    { label: "✅ 开始深度做梦", description: "调用模型提炼决策、风格并更新索引" },
    { label: "⏳ 稍后处理", description: "保留缓冲区，下次提醒" },
    { label: "🗑️ 忽略并清空", description: "直接删除缓冲区内容" }
  ],
  multiSelect: false
)
```

若用户选择“开始深度做梦”：
1. 分析 buffer 中的内容以及对应的 Git Diff。
2. 提取以下维度的信息：
   - **决策点** (Project Decisions)
   - **风格偏好** (Style Preferences)
   - **思维模式** (Thought Patterns)
3. 更新 `~/.yongle_knowledge/memory/` 或本地 `.planning/yongle/memory/` 下的文件。
4. 自动重构/更新 `memory/INDEX.json`。
5. **清理**：清空 `dream_buffer.jsonl`。

</process>

<notes>
- 此 Workflow 通常被注入到 /gsd-resume-work 或类似的启动命令中。
- 采用渐进式披露：先展示摘要，只有在确认归档时才进行大模型深度处理。
</notes>
