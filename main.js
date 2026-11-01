const { app, BrowserWindow, ipcMain, shell, session, screen, Menu, webContents } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const ROOT = __dirname;
const TEST = process.env.MB_TEST === '1';
const SHOT = process.env.MB_SHOT || '';

app.setName('MultiBrowser');
app.setAppUserModelId('com.multibrowser.app');
app.setPath('userData', TEST || SHOT
  ? path.join(require('os').tmpdir(), SHOT ? 'MultiBrowserShot' : 'MultiBrowserTest')
  : path.join(app.getPath('appData'), 'MultiBrowser'));

// 去掉 UA 里的 Electron 标识，避免部分站点提示浏览器不受支持
app.userAgentFallback =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/' +
  process.versions.chrome +
  ' Safari/537.36';

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

let mainWindow = null;
const popupWindows = new Set();

function sessionFile() {
  return path.join(app.getPath('userData'), 'session.json');
}

function workspaceFile() {
  return path.join(app.getPath('userData'), 'workspaces.json');
}

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function createWindow() {
  const work = screen.getPrimaryDisplay().workAreaSize;
  mainWindow = new BrowserWindow({
    width: Math.min(1520, Math.max(980, work.width - 40)),
    height: Math.min(960, Math.max(620, work.height - 60)),
    minWidth: 980,
    minHeight: 620,
    show: false,
    backgroundColor: '#0b0d12',
    title: '多屏浏览器',
    icon: path.join(ROOT, 'app.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(ROOT, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      spellcheck: false,
      backgroundThrottling: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(ROOT, 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => {
    if (!TEST && !SHOT) mainWindow.show();
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 宿主页面自身不弹新窗口
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // Esc 退出全屏（对宿主与每个 webview 都生效）
  const escExit = (ev, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape' && mainWindow && mainWindow.isFullScreen()) {
      mainWindow.setFullScreen(false);
      ev.preventDefault();
    }
  };
  mainWindow.webContents.on('before-input-event', escExit);
  mainWindow.webContents.on('did-attach-webview', (ev, wc) => wc.on('before-input-event', escExit));

  // 限制 webview 的权限与参数
  mainWindow.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    webPreferences.webSecurity = true;
    webPreferences.backgroundThrottling = false;
    if (params.preload && !/guest-preload\.js$/i.test(params.preload)) {
      delete params.preload;
    }
  });

  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('[host renderer gone]', details);
  });
}

function buildMenu() {
  const template = [
    {
      label: '文件',
      submenu: [
        { label: '新建窗口', accelerator: 'CmdOrCtrl+T', click: () => sendToRenderer('shortcut', 'new-pane') },
        { label: '批量打开…', accelerator: 'CmdOrCtrl+Shift+O', click: () => sendToRenderer('shortcut', 'batch-open') },
        { label: '执行脚本…', accelerator: 'CmdOrCtrl+Shift+J', click: () => sendToRenderer('shortcut', 'run-js') },
        { type: 'separator' },
        { role: 'quit', label: '退出' },
      ],
    },
    {
      label: '操作',
      submenu: [
        { label: '全部刷新', accelerator: 'CmdOrCtrl+Shift+R', click: () => sendToRenderer('shortcut', 'reload-all') },
        { label: '同步开关', accelerator: 'CmdOrCtrl+Shift+S', click: () => sendToRenderer('shortcut', 'toggle-sync') },
        { label: '关闭全部窗口', click: () => sendToRenderer('shortcut', 'close-all') },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function setupSession(ses) {
  ses.setPermissionRequestHandler((wc, permission, callback) => {
    const allow = new Set(['clipboard-sanitized-write', 'fullscreen', 'pointerLock', 'notifications', 'media']);
    callback(allow.has(permission));
  });
}

// 所有 webview（含弹窗）统一处理
app.on('web-contents-created', (event, contents) => {
  if (contents.getType() === 'webview') {
    const ses = contents.session;
    contents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            width: 1080,
            height: 780,
            autoHideMenuBar: true,
            backgroundColor: '#ffffff',
            webPreferences: {
              session: ses,
              contextIsolation: true,
              nodeIntegration: false,
              sandbox: true,
            },
          },
        };
      }
      return { action: 'deny' };
    });

    contents.on('will-navigate', (e, url) => {
      if (!/^(https?|file):/i.test(url)) e.preventDefault();
    });
  }

  if (contents.getType() === 'window' && contents !== mainWindow?.webContents) {
    popupWindows.add(contents);
    contents.on('destroyed', () => popupWindows.delete(contents));
  }
});

app.on('session-created', (ses) => setupSession(ses));

app.whenReady().then(() => {
  buildMenu();
  createWindow();

  if (TEST) {
    const win = mainWindow;
    const timer = setTimeout(() => {
      console.log('SELFTEST_TIMEOUT');
      app.exit(3);
    }, 60000);
    win.webContents.once('did-finish-load', async () => {
      try {
        const results = await win.webContents.executeJavaScript('window.__mbTest()');
        console.log('SELFTEST=' + JSON.stringify(results));
        const allOk = Array.isArray(results) && results.every((r) => r.ok);
        clearTimeout(timer);
        setTimeout(() => app.exit(allOk ? 0 : 1), 400);
      } catch (err) {
        console.log('SELFTEST_ERR=' + (err && err.stack || err));
        clearTimeout(timer);
        app.exit(2);
      }
    });
  }

  if (SHOT) {
    const win = mainWindow;
    win.webContents.once('did-finish-load', async () => {
      await new Promise((r) => setTimeout(r, Number(process.env.MB_SHOT_WAIT || 3500)));
      try {
        const modalKey = process.env.MB_SHOT_MODAL;
        if (modalKey) {
          const map = { batch: 'btn-batch', close: 'btn-batch-close', js: 'btn-js', help: 'btn-help', sync: 'btn-sync-set', layout: 'btn-layout' };
          const id = map[modalKey] || modalKey;
          await win.webContents.executeJavaScript(`(() => { const b = document.getElementById(${JSON.stringify(id)}); if (b) b.click(); })()`);
          await new Promise((r) => setTimeout(r, 900));
        }
        if (dialogWin && !dialogWin.isDestroyed()) {
          await new Promise((r) => setTimeout(r, 500));
          const dimg = await dialogWin.webContents.capturePage();
          const dpath = SHOT.replace(/\.png$/i, '') + '-dialog.png';
          fs.writeFileSync(dpath, dimg.toPNG());
          const dsize = dimg.getSize();
          console.log(`DIALOG_SHOT=${dpath} ${dsize.width}x${dsize.height}`);
          dialogWin.destroy();
          dialogWin = null;
          await new Promise((r) => setTimeout(r, 250));
        }
        const img = await win.webContents.capturePage();
        fs.writeFileSync(SHOT, img.toPNG());
        const size = img.getSize();
        console.log(`SHOT=${SHOT} ${size.width}x${size.height}`);
      } catch (err) {
        console.log('SHOT_ERR=' + (err && err.stack || err));
      }
      app.exit(0);
    });
  }

  // 默认会话也设置一遍权限
  setupSession(session.defaultSession);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});

ipcMain.handle('session:load', () => {
  try {
    const raw = fs.readFileSync(sessionFile(), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
});

ipcMain.handle('session:save', (event, data) => {
  try {
    if (!data || typeof data !== 'object') return false;
    const file = sessionFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, file);
    return true;
  } catch (err) {
    console.error('[session save]', err);
    return false;
  }
});

ipcMain.handle('workspace:load', () => {
  try {
    const raw = fs.readFileSync(workspaceFile(), 'utf8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
});

ipcMain.handle('workspace:save', (event, list) => {
  try {
    if (!Array.isArray(list)) return false;
    const file = workspaceFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(list, null, 2), 'utf8');
    fs.renameSync(tmp, file);
    return true;
  } catch (err) {
    console.error('[workspace save]', err);
    return false;
  }
});

ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  chrome: process.versions.chrome,
  electron: process.versions.electron,
  newtab: pathToFileURL(path.join(ROOT, 'newtab.html')).href,
  guestPreload: pathToFileURL(path.join(ROOT, 'guest-preload.js')).href,
  fixture: pathToFileURL(path.join(ROOT, '_test', 'fixture.html')).href,
  userData: app.getPath('userData'),
}));

ipcMain.handle('shell:openExternal', (event, url) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) shell.openExternal(url);
});

ipcMain.handle('pane:devtools', (event, id) => {
  const wc = webContents.fromId(Number(id));
  if (wc) wc.openDevTools({ mode: 'detach' });
});

ipcMain.handle('pane:reset', async (event, partition) => {
  if (typeof partition !== 'string' || !partition.startsWith('persist:')) return false;
  const ses = session.fromPartition(partition);
  await ses.clearStorageData();
  await ses.clearCache();
  return true;
});

let dialogWin = null;

ipcMain.handle('dialog:open', (event, spec) => {
  if (!spec || typeof spec !== 'object') return null;
  if (dialogWin && !dialogWin.isDestroyed()) {
    dialogWin.focus();
    return null;
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
      if (dialogWin && !dialogWin.isDestroyed()) dialogWin.destroy();
      dialogWin = null;
    };
    dialogWin = new BrowserWindow({
      parent: mainWindow || undefined,
      modal: true,
      show: false,
      center: true,
      width: Math.max(380, Math.min(900, Number(spec.width) || 620)),
      height: Math.max(240, Math.min(820, Number(spec.height) || 520)),
      resizable: false,
      minimizable: false,
      maximizable: false,
      title: spec.title || '多屏浏览器',
      backgroundColor: '#10151f',
      icon: path.join(ROOT, 'app.ico'),
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(ROOT, 'dialog-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false,
      },
    });
    dialogWin.setMenuBarVisibility(false);
    dialogWin.loadFile(path.join(ROOT, 'dialog.html'));
    dialogWin.once('ready-to-show', () => {
      if (!SHOT && !TEST) dialogWin.show();
    });
    dialogWin.webContents.once('did-finish-load', () => {
      if (dialogWin && !dialogWin.isDestroyed()) dialogWin.webContents.send('dialog:init', spec);
    });
    if (TEST && spec.kind === 'confirm') {
      setTimeout(() => {
        if (dialogWin && !dialogWin.isDestroyed()) {
          dialogWin.webContents.executeJavaScript("document.querySelector('#yes') && document.querySelector('#yes').click()").catch(() => {});
        }
      }, 500);
    }
    if (TEST && spec.kind === 'batch') {
      setTimeout(() => {
        if (!dialogWin || dialogWin.isDestroyed()) return;
        const url = pathToFileURL(path.join(ROOT, '_test', 'fixture.html')).toString();
        dialogWin.webContents.executeJavaScript(
          `(() => { const i = document.querySelector('#one'); if (i) { i.value = ${JSON.stringify(url)}; document.querySelector('#one-go').click(); } })()`
        ).catch(() => {});
      }, 700);
    }
    if (TEST && spec.kind === 'close') {
      setTimeout(() => {
        if (!dialogWin || dialogWin.isDestroyed()) return;
        dialogWin.webContents.executeJavaScript(
          "(() => { Array.from(document.querySelectorAll('#list input')).slice(0, 2).forEach((b) => { b.checked = true; }); document.querySelector('#go').click(); })()"
        ).catch(() => {});
      }, 700);
    }
    const onResult = (e, result) => {
      if (dialogWin && e.sender === dialogWin.webContents) finish(result);
    };
    ipcMain.on('dialog:result', onResult);
    dialogWin.on('closed', () => {
      ipcMain.removeListener('dialog:result', onResult);
      if (!settled) {
        settled = true;
        resolve(null);
        dialogWin = null;
      }
    });
  });
});

ipcMain.handle('pane:menu', (event, info) => new Promise((resolve) => {
  let settled = false;
  const done = (action) => {
    if (settled) return;
    settled = true;
    resolve(action);
  };
  const hasUrl = !!(info && info.url);
  const menu = Menu.buildFromTemplate([
    { label: '复制网址', enabled: hasUrl, click: () => done('copy') },
    { label: '用系统浏览器打开', enabled: hasUrl, click: () => done('external') },
    { label: '开发者工具', click: () => done('devtools') },
    { type: 'separator' },
    { label: '重置此窗口登录数据', click: () => done('reset') },
    { label: '关闭其他窗口', click: () => done('close-others') },
    { label: '关闭此窗口', click: () => done('close') },
  ]);
  menu.popup({ window: mainWindow || undefined, callback: () => setTimeout(() => done(null), 0) });
}));

ipcMain.handle('window:fullscreen', (event, value) => {
  if (!mainWindow) return false;
  const next = typeof value === 'boolean' ? value : !mainWindow.isFullScreen();
  mainWindow.setFullScreen(next);
  return mainWindow.isFullScreen();
});
