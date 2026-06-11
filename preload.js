'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  onUsageUpdate(callback) {
    ipcRenderer.on('usage-update', (_event, payload) => callback(payload));
  },
  hideWindow() {
    ipcRenderer.send('hide-window');
  },
  markWeeklyReset(ts) {
    ipcRenderer.send('mark-weekly-reset', ts);
  },
  setTariff(name) {
    ipcRenderer.send('set-tariff', name);
  },
  setCurrency(name) {
    ipcRenderer.send('set-currency', name);
  },
  toggleGhostMode() {
    ipcRenderer.send('toggle-ghost-mode');
  },
  onGhostModeChanged(callback) {
    ipcRenderer.on('ghost-mode-changed', (_event, isGhost) => callback(isGhost));
  },
});
