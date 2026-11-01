const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mbDialog', {
  onInit: (callback) => {
    ipcRenderer.on('dialog:init', (event, spec) => callback(spec));
  },
  submit: (result) => {
    ipcRenderer.send('dialog:result', result);
  },
});
