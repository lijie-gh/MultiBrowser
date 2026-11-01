# MultiBrowser · 多屏浏览器

**English** | [简体中文](README.md)

**One window, many screens** — an Electron multi-screen browser with account isolation, action sync, and batch operations.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](#-license)
[![Electron](https://img.shields.io/badge/Electron-43.x-47848f?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/lijie-gh/MultiBrowser/pulls)

> 🌍 The app itself is bilingual — switch between **English** and **中文** in the UI at any time. 中文文档见 [README_ZH.md](README_ZH.md)。

## ✨ Features

- 🖥️ **Multi-screen panes** — tile up to **16 browser panes** in a single window. Every pane has its own isolated cookies (`partition="persist:mbN"`), so you can be logged into **multiple accounts on the same website** at the same time.
- 🔄 **Action sync** — click, type, scroll, press Enter, or pick a dropdown option in one pane, and every checked pane follows along. Actions are replayed as synthetic events (`isTrusted=false`) so sync never loops back on itself.
- ⚡ **Batch operations** — batch-open URLs, batch-close panes, refresh all, mute all, and run JavaScript across all panes in one go.
- 🎨 **Custom layouts** — rows × columns with per-row height and per-column width ratios, or auto layout. Quick preset buttons: 1×1 / 2×2 / 3×3 / 4×4 / 1×2 / 2×1.
- 💾 **Workspaces** — save a full set of pane URLs + layout under a name and restore the whole scene later.
- 🌗 **Dark / light theme** — one-click switch.
- 🌍 **Bilingual UI** — 中文 / English, switchable in-app.
- 🔧 **Per-pane controls** — back / forward / refresh / mute / close, DevTools, and reset login data — each pane independently.
- 💿 **Session auto-save & restore** — your panes come back exactly as you left them. Unified window zoom control and fullscreen mode included.

## 🖼️ Screenshots

> 📸 Coming soon — screenshot contributions are welcome!

<!-- ![Light theme](docs/screenshot-light.png) -->
<!-- ![Dark theme](docs/screenshot-dark.png) -->

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+T` | New window |
| `Ctrl+Shift+O` | Batch open URLs |
| `Ctrl+Shift+R` | Refresh all panes |
| `Ctrl+Shift+S` | Toggle action sync |
| `Ctrl+Shift+J` | Run batch script |

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) **18+**

### Installation & Run

```bash
git clone https://github.com/lijie-gh/MultiBrowser.git
cd MultiBrowser
npm install --ignore-scripts
npm start
```

> `npm install --ignore-scripts` keeps the install lean and safe — MultiBrowser ships no native modules that need build scripts.

## 📁 Project Structure

```text
MultiBrowser/
├── main.js             # Electron main process (window management, IPC, session persistence)
├── preload.js          # contextBridge — exposes the window.mb API to the renderer
├── guest-preload.js    # action capture & sync replay inside each webview
├── i18n.js             # Chinese / English translations
├── dialog.js           # modal dialog logic
├── dialog.html         # modal dialog UI
├── dialog-preload.js   # dialog preload bridge
├── newtab.html         # new tab page
└── renderer/           # main interface
    ├── index.html
    ├── styles.css
    └── app.js
```

## 🛠 Tech Stack

- **Electron 43.x** — desktop shell
- **Plain HTML / CSS / JS** — no framework, no build step
- **`<webview>` tags** — one per pane, each on its own session partition for account isolation
- **`contextBridge` + `ipcRenderer`** — sandboxed bridge between the UI and the main process (`window.mb` API)
- **`guest-preload.js`** — captures user actions inside each webview and replays them across synced panes

## 🌍 Theme & Language

- 🌗 Dark / light theme toggle in the app.
- 🌍 UI language switch (中文 / English) — labels update instantly, no restart needed.

## 📄 License

Released under the **MIT License**.
