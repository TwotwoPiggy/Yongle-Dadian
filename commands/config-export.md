---
name: yongle:config-export
description: 导出永乐大典全局配置（apiKey 字段已自动排除）
argument-hint: 
allowed-tools:
  - Read
  - Bash
---
<objective>
将全局配置文件 (~/.yongle_knowledge/config.json) 以 JSON 格式输出。
apiKey 字段在输出中自动排除，不会以明文或掩码形式出现。
输出的 JSON 是完整配置快照，可直接用于 /yongle-config import。
</objective>

<process>
运行 `node D:/Computers/AIDevelop/Tools/Skills/yongle-dadian/scripts/yongle-config-export.js` 读取配置并输出 JSON。将输出结果返回给用户。
</process>
