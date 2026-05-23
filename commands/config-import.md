---
name: yongle:config-import
description: 从 JSON 文件导入并合并配置（含预览确认）
argument-hint: <file>
allowed-tools:
  - Read
  - Write
  - Bash
---
<objective>
从指定 JSON 文件导入配置并与全局配置文件 (~/.yongle_knowledge/config.json) 进行深度合并。
导入前会显示 dry-run 预览（新增/更新/未变更的顶层区块），并要求用户确认。
导入文件中的 apiKey 字段会自动排除并给出警告。
</objective>

<process>
运行 `node D:/Computers/AIDevelop/Tools/Skills/yongle-dadian/scripts/yongle-config-import.js <file>` 执行导入流程。如果控制台出现交互式提示，则询问用户并输入对应指令。
</process>
