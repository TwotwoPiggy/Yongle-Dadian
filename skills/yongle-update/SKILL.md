---
name: yongle-update
description: 更新永乐大典到最新版本
---

<objective>
检查永乐大典知识库的更新情况，拉取并应用最新版本，之后重新注入技能（skills）与工作流（workflows）到对应的 AI 运行时（如 Antigravity 或 Claude）。
</objective>

<process>
运行永乐大典内置的自动更新脚本。

执行以下命令：
```bash
node {{YONGLE_INSTALL_DIR}}/scripts/yongle-update.js
```

**注意事项与错误处理**：
1. 脚本将自动识别您当前的安装模式（Git 开发模式或 npm 全局安装模式），并执行对应的版本检测和更新逻辑。
2. 升级完成后，脚本会自动扫描已有的安装凭证（install-manifest.json）并对各个 AI 运行时进行技能的重注入。
3. 如果更新成功，请根据脚本最后的输出提示重启您的 AI 终端/客户端以加载最新的技能。
4. 如果脚本中途报错退出：
   - Git 模式下，脚本会尝试自动回滚代码到更新前的 Commit。
   - 如果发生网络超时等问题，请检查网络连接并重试。
   - 您也可以选择进入 `{{YONGLE_INSTALL_DIR}}` 目录下手动执行 `git pull` 或 `npm install -g yongle-dadian@latest`。
</process>
