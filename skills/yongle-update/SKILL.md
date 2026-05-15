---
name: yongle-update
description: 更新永乐大典到最新版本
---


<objective>
检查永乐大典的更新，安装最新版本，并重新注入 skills 和 workflows 到目标 runtime。
</objective>

<process>

**Step 1: 检查当前版本**

读取当前安装的 `package.json` 获取版本号。

```bash
CURRENT_VERSION=$(node -e "console.log(require('{{YONGLE_INSTALL_DIR}}/package.json').version)")
```

**Step 2: 检查最新版本**

```bash
LATEST_VERSION=$(npm view yongle-dadian version 2>/dev/null || echo "unknown")
```

**Step 3: 比较与更新**

如果本地安装（git 仓库），执行 `git pull`。
如果 npm 安装，执行 `npm install -g yongle-dadian@latest`。

**Step 4: 重新注入**

更新完成后重新运行安装器：
```bash
node {{YONGLE_INSTALL_DIR}}/bin/install.js --global --antigravity
```

</process>
