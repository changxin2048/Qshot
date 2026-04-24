# Qshot — Claude 协作指南

> 给 Claude 和后续贡献者：这份文档解释项目结构、怎么跑起来、怎么调试、怎么发布。

## 项目简介

**Qshot（子弹搜索）** 是一个 Chrome MV3 浏览器扩展：

- **多 AI 批量搜索**：在一个查询页里同时调用多个 AI 站点（Kimi、Gemini、DeepSeek 等），结果并排展示
- **快速站点跳转**：popup 里一键进入收藏站点
- **悬浮层**：任意页面按 `Ctrl+Q` 唤起全局搜索浮层

## 仓库结构

```
D:\Qshot-1.1.1\
├── src/                 ← 唯一源码目录（所有会打包进扩展的文件）
│   ├── manifest.json
│   ├── icons/
│   ├── background.js
│   ├── config/          ← baseConfig.js + 静态 json
│   ├── iframe/          ← content script + compare 页
│   │   ├── inject.js    (入口，re-export src/iframe/inject/main.js)
│   │   ├── inject/      (7 个拆分模块)
│   │   ├── overlay.js   (入口)
│   │   ├── overlay/     (6 个模块 + styles.js)
│   │   ├── overlay_main.js
│   │   ├── iframe.js    (入口)
│   │   ├── iframe/      (13 个模块)
│   │   ├── iframe.html / iframe.css
│   ├── popup/           ← toolbar popup
│   ├── settings/        ← 选项页（拆成 sections/*）
│   └── shared/          ← 跨入口共享模块（i18n、storage-keys 等）
│
├── dist/                ← 构建产物，.gitignore，加载扩展时指向这里
├── build.mjs            ← esbuild 脚本
├── package.json
├── manifest? NO — 已迁入 src/
│
├── README.md            ← 面向用户（GitHub 首页）
├── LICENSE              ← 开源协议（构建时复制进 dist/）
├── PRIVACY.md           ← 隐私政策（构建时复制进 dist/）
└── CLAUDE.md            ← 本文件
```

**规则**：根目录只放仓库元信息。所有会被打包进 Chrome 扩展的内容都在 `src/`。构建产物 `dist/` 不进 git。

## 开发启动

```bash
# 一次性
npm install

# 开发模式（推荐）— watch 模式，改动自动重建
npm run watch

# 或单次构建
npm run build
```

然后在 Chrome 里加载扩展：

1. 访问 `chrome://extensions/`
2. 右上角打开 **开发者模式**
3. 点 **加载已解压的扩展程序**
4. 选择 **`D:\Qshot-1.1.1\dist`**（选 `dist/`，不是仓库根）

## 刷新 / 调试（重要）

改完代码后怎么让 Chrome 看到新版本 —— 根据改动的位置分三种情况：

| 改了哪里 | 步骤 |
|---|---|
| `background.js` / popup / settings / compare 页 | watch 自动重建 → `chrome://extensions/` 点 Qshot 卡片的 🔄 刷新图标 → 下次打开 popup/settings 就是新的 |
| **content script**（`inject.js`、`overlay.js`、`overlay_main.js`）| watch 重建 → 点 🔄 **还不够**。MV3 **不会**把新 content script 注入到已打开的标签页。**必须关闭并重开**目标标签页（点 × 而不是 F5） |
| 静态资源（html/css/png/svg）| watch 会复制。刷新扩展 + 重开相关页面 |

**调试建议**：

- background service worker：`chrome://extensions/` → Qshot 卡片 → "检查视图：Service Worker"
- popup：右键 popup 按钮 → 检查弹出内容
- compare 页（iframe.html）：在 compare 页直接 F12
- content script：在目标网站 F12，"顶部" 上下文切换到扩展的 content script world

**万用诊断**：如果某个 `inject.js:行号` 报错在新 dist 里不存在，那就是旧 content script 还在旧标签里跑 —— 关标签页重开即可。

## 打包发布

上传 Chrome Web Store / Edge Add-ons：

```bash
# 生产构建（minify、无 sourcemap）
NODE_ENV=production npm run build

# 打包 dist/ 的"内容"为 zip（注意：不是 dist 文件夹本身）
cd dist
zip -r ../qshot-$(node -p "require('../package.json').version").zip .
cd ..
```

zip 根目录必须直接看到 `manifest.json`（不是 `dist/manifest.json`）。

## 代码约束

1. **单文件 ≤ 500 行**。超过就继续拆模块。现有的 `src/*/*/` 子目录（比如 `src/iframe/inject/`、`src/settings/settings/sections/`）就是拆分结果。
2. **新增 JS 入口**（例如加一个新 popup 或新 content script）：
   - 在 `src/` 下放源码
   - 在 `build.mjs` 的 `ENTRIES` 数组加一行
   - 在 `src/manifest.json` 里声明
3. **新增静态资源**（html/css/图片 等）：
   - 放到 `src/` 对应目录下
   - 在 `build.mjs` 的 `SRC_ASSETS` 数组加一行
4. **manifest 里的路径**：都相对于扩展根（= `dist/`）。例如 manifest 写 `"popup/popup.html"`，指的是 `dist/popup/popup.html`，源文件在 `src/popup/popup.html`。

## 分支约定

- `main` — 跟踪 `origin/main`（`30bewater/Qshot` 上游）。只做 merge from upstream 或 PR 合并。
- `dev` — 本地开发分支，基于 `main` 线性演进。所有功能开发、bug 修复都在 dev 上。

未来发 PR 到上游：
```bash
# 在 GitHub 上 Fork → 本地加 remote
git remote add myfork https://github.com/<你>/Qshot.git
git push myfork dev
# 然后在 GitHub 页面上发 PR，base=30bewater/Qshot:main，head=<你>:dev
```

## 已知踩坑 & 设计决策

1. **`all_frames: true` 的陷阱**：content script 会注入到第三方站点**自己的**内嵌 iframe。此时 `window.parent.origin` 不是扩展，而是站点自身（例如 `https://gemini.google.com`）。如果用严格 `targetOrigin` 做 `postMessage`，会**同步抛错** `Failed to execute 'postMessage' on 'DOMWindow'`。
   - 解决：所有 `window.parent.postMessage(data, EXTENSION_ORIGIN)` 都要 `try/catch` 包住（见 `src/iframe/inject/main.js` 的 `reportCurrentUrl` 和 `notifyParentFrame`）。

2. **`web_accessible_resources` 易漏**：content script 用 `chrome.runtime.getURL('config/siteHandlers.json')` 去 fetch 时，如果没在 manifest 的 `web_accessible_resources` 里声明，或被用户的广告/隐私拦截器拦截，会报 `ERR_BLOCKED_BY_CLIENT`。
   - 解决：所有要 fetch 的扩展内资源都列进 `web_accessible_resources`；所有 fetch 调用都要兜底（见 `loadRegistry` 的 try/catch）。

3. **Content script 不热更新**：再次强调 —— MV3 的 content script 是 `document_start` 一次性注入，扩展刷新后**不会**自动重注入到已经打开的标签页。刷新扩展后必须关闭并重开目标标签页，或者运行一段时间再打开新页面。

4. **同步 popup 布局**：popup.js 用 `ResizeObserver` 监听 composer 高度变化，`syncComposerLayout` 会根据文本行数切换 `.is-expanded`。如果将来改布局，注意这个回调被 `state.syncComposerLayout` 注册给 sections 和 prompt-edit-modal 使用，避免循环 import。

## 给 Claude 的提示

- 改代码前先看对应入口文件（例如改 inject 行为就看 `src/iframe/inject/main.js`），它会 re-export 实际的逻辑模块。
- 所有提交 author 统一为 `LXG <mail@liuxiaogang.cn>`（如果你帮用户提交）。
- 不要跨边界修改 `main` 分支的历史，它跟踪上游。
- 给 content script 加日志时注意：修改后必须**关闭并重开**测试标签页才能看到，刷新扩展页面不够。
