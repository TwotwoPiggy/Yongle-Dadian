<purpose>
开启永乐大典“过程探针”活跃追踪。初始化一个动态更新的记录文件（WATCHING.md），用于捕获任务过程中的思路、实验代码与状态变更，增强长对话场景下的复盘准确性。
</purpose>

<process>

**Step 1: 环境准备与冲突检查**

1. **确定追踪文件路径**：
   默认为项目根目录下的 `.planning/yongle/WATCHING.md`。

2. **检查是否已存在活跃追踪**：
   ```bash
   if [ -f ".planning/yongle/WATCHING.md" ]; then
     echo "⚠️  检测到已存在活跃追踪任务。"
   fi
   ```

   若文件已存在，使用 `AskUserQuestion` 询问：
   ```
   AskUserQuestion(
     header: "活跃追踪冲突",
     question: "当前已有一个正在进行的追踪任务，你想怎么做？",
     options: [
       { label: "🆕 覆盖并开启新任务", description: "删除旧的 WATCHING.md 并重新开始" },
       { label: "🤝 继续现有任务", description: "在现有文件末尾追加新说明" },
       { label: "❌ 取消", description: "不执行任何操作" }
     ],
     multiSelect: false
   )
   ```

---

**Step 2: 收集初始信息**

1. **解析描述**：提取 `$ARGUMENTS` 作为初始任务描述。
2. **引导式提问**（若参数为空）：
   询问用户：“你想开启追踪的任务目标是什么？”以及“目前有什么初步的假设或思路吗？”

---

**Step 3: 初始化 WATCHING.md**

将以下结构写入 `.planning/yongle/WATCHING.md`：

```markdown
# 永乐大典：活跃追踪 (Active Watching)

- **任务目标**: {task_description}
- **启动时间**: {current_datetime}
- **初始假设**: {initial_hypothesis}
- **当前关注文件**: {active_files}

---

## ⏳ 过程时间线 (Timeline)

> [!IMPORTANT]
> **AI 指导**：请在每轮操作（编写代码、运行测试等）后，简要在此 Timeline 下方追加你的发现与进展。

- [开始] 标记任务启动点。
```

---

**Step 4: 完成响应**

显示横幅：
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 永乐大典 ► 过程探针已启动 🟢
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📄 监控文件: .planning/yongle/WATCHING.md
💡 提示: 我将持续在后台同步你的操作动向至此文件。

任务完成后，请运行 /yongle-postmortem 进行深度归档。
```

</process>

<notes>
- WATCHING.md 仅在当前项目范围内有效。
- 逻辑上不涉及多 Agent 竞争同一文件的复杂锁机制，采用追加模式。
- 文件路径必须通过 validatePath 校验以确保安全性。
</notes>
