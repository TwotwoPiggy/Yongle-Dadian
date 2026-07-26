---
name: yongle-status
description: 查看永乐大典后台自动化功能的运行状态与健康看板
---

<objective>
查看永乐大典后台三大自动化功能（1.前置自动搜索、2.会话停止自动归档、4.梦境守护整理）的当前状态、上次触发时间、耗时及运行结果/报错日志。
</objective>

<process>
运行永乐大典内置的状态看板脚本。

执行以下命令：
```bash
node {{YONGLE_INSTALL_DIR}}/scripts/yongle-status.js
```
</process>
