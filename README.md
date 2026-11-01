# 多屏浏览器 · MultiBrowser

[English](README_EN.md) | **简体中文**

**一个窗口多个屏幕**——支持多账号隔离、同步操作、批量操作的多屏浏览器。
One window, many screens — an Electron multi-screen browser with account isolation, action sync, and batch operations.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](#-许可证)
[![Electron](https://img.shields.io/badge/Electron-43.x-47848f?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/lijie-gh/MultiBrowser/pulls)

> 🌍 程序界面自带双语，随时在 **中文 / English** 之间切换。English docs: [README.md](README.md).

## ✨ 核心功能

- 🖥️ **多屏浏览器窗格**——单窗口内平铺最多 **16 个浏览器窗格**。每个窗格独立 Cookie（`partition="persist:mbN"`），可**同时登录同一网站的多个账号**。
- 🔄 **同步操作**——在一个窗格点击/输入/滚动/回车/下拉选择，其他勾选的窗格跟着做。操作以合成事件重放（`isTrusted=false`），不会触发回环。
- ⚡ **批量操作**——批量打开网址、批量关闭、全部刷新、全部静音、批量执行 JavaScript，一次搞定。
- 🎨 **自定义布局**——行数×列数 + 每行高/列宽比例，或自动排版。快速布局预设按钮：1×1 / 2×2 / 3×3 / 4×4 / 1×2 / 2×1。
- 💾 **工作区管理**——把整套窗口网址+布局命名保存，随时一键恢复。
- 🌗 **深色/浅色主题**——一键切换。
- 🌍 **双语界面**——中文 / English，应用内切换。
- 🔧 **每窗格独立控制**——前进/后退/刷新/静音/关闭、开发者工具、重置登录数据，各窗格互不影响。
- 💿 **会话自动保存恢复**——重新打开时窗格原样回来。还带窗口缩放统一控制与全屏模式。

## 🖼️ 截图

> 📸 敬请期待——欢迎提交截图！

<!-- ![浅色主题](docs/screenshot-light.png) -->
<!-- ![深色主题](docs/screenshot-dark.png) -->

## ⌨️ 快捷键

| 快捷键 | 功能 |
| --- | --- |
| `Ctrl+T` | 新窗口 |
| `Ctrl+Shift+O` | 批量打开网址 |
| `Ctrl+Shift+R` | 全部刷新 |
| `Ctrl+Shift+S` | 同步操作开关 |
| `Ctrl+Shift+J` | 批量执行脚本 |

## 🚀 快速开始

### 环境要求

- [Node.js](https://nodejs.org/) **18+**

### 安装与运行

```bash
git clone https://github.com/lijie-gh/MultiBrowser.git
cd MultiBrowser
npm install --ignore-scripts
npm start
```

> 用 `npm install --ignore-scripts` 安装更轻快、更安全——MultiBrowser 没有需要构建脚本的原生模块。

## 📁 目录结构

```text
MultiBrowser/
├── main.js             # Electron 主进程（窗口管理、IPC、会话持久化）
├── preload.js          # contextBridge 暴露 window.mb API
├── guest-preload.js    # webview 内事件捕获与同步重放
├── i18n.js             # 中英双语翻译
├── dialog.js           # 模态对话框逻辑
├── dialog.html         # 模态对话框界面
├── dialog-preload.js   # 对话框 preload 桥接
├── newtab.html         # 新标签页
└── renderer/           # 主界面
    ├── index.html
    ├── styles.css
    └── app.js
```

## 🛠 技术栈

- **Electron 43.x**——桌面外壳
- **原生 HTML / CSS / JS**——无框架、无构建步骤
- **`<webview>` 标签**——每个窗格一个，各自独立 session partition 实现账号隔离
- **`contextBridge` + `ipcRenderer`**——界面与主进程之间的沙箱安全桥（`window.mb` API）
- **`guest-preload.js`**——在每个 webview 内捕获用户操作，并向勾选同步的窗格重放

## 🌍 主题与语言

- 🌗 应用内深色/浅色主题切换。
- 🌍 界面语言切换（中文 / English），文案即时更新，无需重启。

## 📄 许可证

本项目采用 **MIT License** 开源发布。
