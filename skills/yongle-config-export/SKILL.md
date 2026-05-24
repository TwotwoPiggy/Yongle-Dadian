---
name: yongle-config-export
description: 导出永乐大典全局配置（apiKey 字段已自动排除）
---

<objective>
将全局配置文件 (~/.yongle_knowledge/config.json) 以 JSON 格式输出。
apiKey 字段在输出中自动排除，不会以明文或掩码形式出现。
输出的 JSON 是完整配置快照，可直接用于 /yongle-config import。
</objective>

<process>
Execute the yongle-config-export workflow from the yongle-dadian installation.

Workflow location: @{{YONGLE_INSTALL_DIR}}/workflows/yongle-config-export.md
</process>
