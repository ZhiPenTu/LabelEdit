const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('commerceDesktop', Object.freeze({
  invoke: (method, args = {}) => ipcRenderer.invoke('commerce:platform', method, args),
  onChanged: callback => { const listener = () => callback(); ipcRenderer.on('commerce:changed', listener); return () => ipcRenderer.removeListener('commerce:changed', listener); },
}));
