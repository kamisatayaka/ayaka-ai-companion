// 预加载脚本：安全地把主进程能力暴露给前端（contextBridge + IPC）。
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  sendChat: (payload) => ipcRenderer.invoke('chat:send', payload),
  sendProactive: () => ipcRenderer.invoke('chat:proactive'),
  transcribeAudio: (audio) => ipcRenderer.invoke('stt:transcribe', audio),
  speak: (text) => ipcRenderer.invoke('tts:speak', { text }),
  showMainWindow: () => ipcRenderer.invoke('window:show-main'),
  floatingDragStart: () => ipcRenderer.invoke('floating:drag-start'),
  floatingDragEnd: () => ipcRenderer.invoke('floating:drag-end'),
  moveFloatingBy: (dx, dy) => ipcRenderer.invoke('floating:move', dx, dy),
  loadHistory: () => ipcRenderer.invoke('history:load'),
  saveHistory: (messages) => ipcRenderer.invoke('history:save', messages),
  getStatus: () => ipcRenderer.invoke('app:status'),
  getMemories: () => ipcRenderer.invoke('memory:list'),
  onMemoryUpdated: (callback) => {
    const listener = (_event, facts) => callback(facts)
    ipcRenderer.on('memory:updated', listener)
    return () => ipcRenderer.removeListener('memory:updated', listener)
  }
})
