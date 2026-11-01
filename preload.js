const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mb', {
  loadSession: () => ipcRenderer.invoke('session:load'),
  saveSession: (data) => ipcRenderer.invoke('session:save', data),
  loadWorkspaces: () => ipcRenderer.invoke('workspace:load'),
  saveWorkspaces: (list) => ipcRenderer.invoke('workspace:save', list),
  info: () => ipcRenderer.invoke('app:info'),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  openDevTools: (id) => ipcRenderer.invoke('pane:devtools', id),
  resetPane: (partition) => ipcRenderer.invoke('pane:reset', partition),
  openDialog: (spec) => ipcRenderer.invoke('dialog:open', spec),
  paneMenu: (info) => ipcRenderer.invoke('pane:menu', info),
  setFullScreen: (value) => ipcRenderer.invoke('window:fullscreen', value),
  onShortcut: (cb) => {
    const handler = (event, name) => cb(name);
    ipcRenderer.on('shortcut', handler);
    return () => ipcRenderer.removeListener('shortcut', handler);
  },
});
