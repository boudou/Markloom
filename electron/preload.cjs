// The renderer's only door to the desktop. File access is limited by the main process
// to folders the user opened documents from.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('markloomDesktop', {
  isDesktop: true,
  platform: process.platform,

  /** Documents handed to the app by the OS before the page was ready */
  takePendingFiles: () => ipcRenderer.invoke('take-pending-files'),
  /** Documents handed over while the app is running (double-click, "Open with") */
  onOpenFiles: (callback) => {
    const listener = (_event, files) => callback(files);
    ipcRenderer.on('open-files', listener);
    return () => ipcRenderer.removeListener('open-files', listener);
  },

  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  statFile: (filePath) => ipcRenderer.invoke('stat-file', filePath),
  writeFile: (filePath, data) => ipcRenderer.invoke('write-file', filePath, data),

  /** Renders static HTML to a PDF with Chromium's print engine */
  printToPdf: (html, options) => ipcRenderer.invoke('print-pdf', html, options),
});
