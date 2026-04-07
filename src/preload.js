/**
 * preload.js — Secure Context Bridge
 * Exposes only specific APIs to the renderer (no full Node access)
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ghostmind', {
  // AI
  callClaude: (question, systemPrompt) =>
    ipcRenderer.invoke('claude-api', { question, systemPrompt }),

  // Settings
  saveApiKey: (key) => ipcRenderer.invoke('save-api-key', key),
  getApiKey: () => ipcRenderer.invoke('get-api-key'),

  // Window
  minimize: () => ipcRenderer.send('window-minimize'),
  hide: () => ipcRenderer.send('window-hide'),
  move: (x, y) => ipcRenderer.send('window-move', { x, y }),

  // Stealth
  toggleStealth: (enable) => ipcRenderer.invoke('toggle-stealth', enable),

  // Listen for events from main — removes old listener first to prevent duplicates
  onTriggerListen: (cb) => {
    ipcRenderer.removeAllListeners('trigger-listen');
    ipcRenderer.on('trigger-listen', cb);
  },
  removeListeners: () => ipcRenderer.removeAllListeners('trigger-listen'),
});
