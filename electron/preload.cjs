// The renderer's only door to the desktop. File access is limited by the main process
// to folders the user opened documents from.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('markloomDesktop', {
  isDesktop: true,
  platform: process.platform,

  /** Documents and the folder handed to the app by the OS before the page was ready: { files, folder } */
  takePendingFiles: () => ipcRenderer.invoke('take-pending-files'),
  /** Documents handed over while the app is running (double-click, "Open with") */
  onOpenFiles: (callback) => {
    const listener = (_event, files) => callback(files);
    ipcRenderer.on('open-files', listener);
    return () => ipcRenderer.removeListener('open-files', listener);
  },
  /** A folder handed over while the app is running (command line, second instance) */
  onOpenFolder: (callback) => {
    const listener = (_event, folder) => callback(folder);
    ipcRenderer.on('open-folder', listener);
    return () => ipcRenderer.removeListener('open-folder', listener);
  },

  /** One level of a trusted folder: [{ name, isDirectory }] */
  listFolder: (dirPath) => ipcRenderer.invoke('list-folder', dirPath),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  statFile: (filePath) => ipcRenderer.invoke('stat-file', filePath),
  writeFile: (filePath, data) => ipcRenderer.invoke('write-file', filePath, data),

  /** Renders static HTML to a PDF with Chromium's print engine */
  printToPdf: (html, options) => ipcRenderer.invoke('print-pdf', html, options),

  /** Sets minimize to tray / close to tray ({ minimizeToTray?, closeToTray? }) and returns both; {} only reads them */
  updateWindowPrefs: (changes) => ipcRenderer.invoke('update-window-prefs', changes),
  /** Windows: adds or removes "Open with Markloom" in the Explorer menu and returns { enabled, portable }; no argument only reads */
  setExplorerMenu: (enabled) => ipcRenderer.invoke('set-explorer-menu', enabled),
});
