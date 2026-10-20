// Electron main process: wraps the Markloom web build in a native desktop window.
const { app, BrowserWindow, protocol, net, shell, dialog, ipcMain, Menu, session } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { pathToFileURL } = require('url');

const DEV_URL = process.env.VITE_DEV_SERVER_URL;

// Second line of defence behind the renderer's HTML sanitizer: even if markup from a
// document slipped through, it can't run scripts or send data anywhere.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https: http:",
  "font-src 'self' data:",
  "connect-src 'self' data: blob: https:", // exports fetch remote images to embed them
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');
const DIST_DIR = path.join(__dirname, '..', 'dist');
const DOCUMENT_EXTENSIONS = /\.(md|markdown|mdx|mmd|txt)$/i;
const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|svg|bmp|avif|ico|tiff?)$/i;

// Even inside a trusted folder the page reaches only what a document needs: documents,
// the images and PDFs they link, and new images in an assets/ folder (where dropped
// images go). Keys, configs and executables stay out of reach.
const canRead = (file) => DOCUMENT_EXTENSIONS.test(file) || IMAGE_EXTENSIONS.test(file) || /\.pdf$/i.test(file);
const canWrite = (file) =>
  DOCUMENT_EXTENSIONS.test(file) ||
  (IMAGE_EXTENSIONS.test(file) && path.basename(path.dirname(file)).toLowerCase() === 'assets');

// Serve the production build from a secure custom scheme so browser APIs that
// require a secure context (File System Access API, IndexedDB, etc.) keep working.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);

function registerAppProtocol() {
  protocol.handle('app', (request) => {
    const { pathname } = new URL(request.url);
    let filePath = path.normalize(path.join(DIST_DIR, decodeURIComponent(pathname)));
    if (!filePath.startsWith(DIST_DIR) || pathname === '/') {
      filePath = path.join(DIST_DIR, 'index.html');
    }
    return net.fetch(pathToFileURL(filePath).toString()).then((response) => {
      const headers = new Headers(response.headers);
      headers.set('Content-Security-Policy', CONTENT_SECURITY_POLICY);
      return new Response(response.body, { status: response.status, headers });
    });
  });
}

// ---------------------------------------------------------------------------
// Files opened from the OS (double-click, "Open with", drag onto the app icon).
// The page may read and write only inside folders the user opened a file from, or, for a
// file in a broad folder (home, a drive root), only that file and its assets/ folder.

const trustFile = () => path.join(app.getPath('userData'), 'trusted-folders.json');
let trustedDirs = new Set();
let trustedFiles = new Set();

// Opening ~/notes.md must not hand the page the whole home folder
function isBroadFolder(dir) {
  return dir === path.parse(dir).root || dir === os.homedir();
}

// Real paths, so a symlink inside a trusted folder cannot lead the page elsewhere
function realPaths(paths) {
  return paths.flatMap((p) => {
    try {
      return [fs.realpathSync(p)];
    } catch {
      return [];
    }
  });
}

function loadTrust() {
  try {
    const saved = JSON.parse(fs.readFileSync(trustFile(), 'utf8'));
    // Older versions saved a plain list of folders
    const { dirs = [], files = [] } = Array.isArray(saved) ? { dirs: saved } : saved;
    trustedDirs = new Set(realPaths(dirs).filter((dir) => !isBroadFolder(dir)));
    trustedFiles = new Set(realPaths(files));
  } catch {
    trustedDirs = new Set();
    trustedFiles = new Set();
  }
}

function saveTrust() {
  try {
    fs.writeFileSync(trustFile(), JSON.stringify({ dirs: [...trustedDirs], files: [...trustedFiles] }));
  } catch {
    // Not fatal: access still works for this session
  }
}

function trustFolderOf(filePath) {
  let file;
  try {
    file = fs.realpathSync(path.resolve(filePath));
  } catch {
    return;
  }
  const dir = path.dirname(file);
  if (isBroadFolder(dir)) {
    if (trustedFiles.has(file)) return;
    trustedFiles.add(file);
    trustedDirs.add(path.join(dir, 'assets'));
  } else {
    if (trustedDirs.has(dir)) return;
    trustedDirs.add(dir);
  }
  saveTrust();
}

// Follows symlinks for the part of the path that exists; a file still to be created
// resolves through its nearest existing parent folder.
async function realPathOf(filePath) {
  const resolved = path.resolve(filePath);
  const missing = [];
  let existing = resolved;
  for (;;) {
    try {
      return path.join(await fs.promises.realpath(existing), ...missing.reverse());
    } catch (error) {
      const parent = path.dirname(existing);
      if (error.code !== 'ENOENT' || parent === existing) throw error;
      missing.push(path.basename(existing));
      existing = parent;
    }
  }
}

/**
 * Resolves the path and checks it is trusted and of a kind `allowed` accepts (checked on the
 * real path, so a `notes.md` symlink to a key file is refused). Use the returned path for the access.
 */
async function assertTrusted(filePath, allowed) {
  const denied = new Error('Markloom does not have access to that location');
  if (typeof filePath !== 'string') throw denied;
  let real;
  try {
    real = await realPathOf(filePath);
  } catch {
    throw denied;
  }
  const inTrustedDir = [...trustedDirs].some((dir) => real.startsWith(dir + path.sep));
  if (!(inTrustedDir || trustedFiles.has(real)) || !allowed(real)) throw denied;
  return real;
}

let rendererReady = false;
const pendingFiles = [];

function documentsIn(argv) {
  return argv
    .slice(1)
    .filter((arg) => !arg.startsWith('-') && DOCUMENT_EXTENSIONS.test(arg))
    .map((arg) => path.resolve(arg))
    .filter((file) => fs.existsSync(file));
}

function openDocuments(files) {
  if (files.length === 0) return;
  files.forEach(trustFolderOf);
  const [win] = BrowserWindow.getAllWindows();
  if (win && rendererReady) win.webContents.send('open-files', files);
  else pendingFiles.push(...files);
}

ipcMain.handle('take-pending-files', () => {
  rendererReady = true;
  return pendingFiles.splice(0);
});

ipcMain.handle('read-file', async (_event, filePath) => {
  return fs.promises.readFile(await assertTrusted(filePath, canRead));
});

ipcMain.handle('write-file', async (_event, filePath, data) => {
  if (typeof data !== 'string' && !(data instanceof Uint8Array)) throw new Error('Unsupported file contents');
  const target = await assertTrusted(filePath, canWrite);
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  await fs.promises.writeFile(target, data);
});

// ---------------------------------------------------------------------------
// PDF export: Chromium's own print engine gives selectable vector text and real page
// breaks. The HTML arrives already rendered (diagrams as SVG), so scripts stay off.

ipcMain.handle('print-pdf', async (_event, html, options = {}) => {
  const tempFile = path.join(os.tmpdir(), `markloom-print-${Date.now()}.html`);
  await fs.promises.writeFile(tempFile, html, 'utf8');
  const printer = new BrowserWindow({
    show: false,
    webPreferences: { javascript: false, sandbox: true, contextIsolation: true },
  });
  try {
    await printer.loadFile(tempFile);
    return await printer.webContents.printToPDF({
      pageSize: options.pageSize || 'A4',
      landscape: options.landscape === true,
      printBackground: true,
      margins: { marginType: 'custom', top: 0.6, bottom: 0.6, left: 0.6, right: 0.6 },
    });
  } finally {
    printer.destroy();
    fs.promises.unlink(tempFile).catch(() => {});
  }
});

// ---------------------------------------------------------------------------

function setUpSpellCheck() {
  // Windows and macOS use the system checker (installed languages); elsewhere pick ours
  try {
    const wanted = ['en-US', 'en-GB', 'el', 'el-GR'];
    const available = session.defaultSession.availableSpellCheckerLanguages;
    const languages = wanted.filter((lang) => available.includes(lang));
    if (languages.length) session.defaultSession.setSpellCheckerLanguages(languages);
  } catch {
    // Platform manages languages itself
  }
}

function contextMenuFor(win, params) {
  const items = [];
  if (params.misspelledWord) {
    for (const suggestion of params.dictionarySuggestions.slice(0, 5)) {
      items.push({ label: suggestion, click: () => win.webContents.replaceMisspelling(suggestion) });
    }
    if (params.dictionarySuggestions.length === 0) items.push({ label: 'No suggestions', enabled: false });
    items.push(
      {
        label: 'Add to dictionary',
        click: () => win.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
      },
      { type: 'separator' }
    );
  }
  if (params.isEditable) {
    items.push({ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' });
  } else if (params.selectionText) {
    items.push({ role: 'copy' });
  }
  return items.length ? Menu.buildFromTemplate(items) : null;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 500,
    backgroundColor: '#FFFFFF',
    title: 'Markloom',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    show: false,
    // Hide the native frame and let the app's own TitleBar act as the window chrome.
    titleBarStyle: 'hidden',
    titleBarOverlay:
      process.platform === 'darwin'
        ? undefined
        : { color: '#F8F9FA', symbolColor: '#5A5A5A', height: 44 },
    trafficLightPosition: { x: 14, y: 14 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  win.once('ready-to-show', () => win.show());

  win.webContents.on('context-menu', (_event, params) => {
    contextMenuFor(win, params)?.popup({ window: win });
  });

  // The renderer blocks unload while documents have unsaved changes; ask before discarding them.
  win.webContents.on('will-prevent-unload', (event) => {
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning',
      buttons: ['Close without saving', 'Keep editing'],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
      title: 'Unsaved changes',
      message: 'Some documents have unsaved changes.',
      detail: 'If you close Markloom now, those changes will be lost.',
    });
    if (choice === 0) event.preventDefault();
  });

  // The app never navigates its own window; links open in a tab, a new window, or the browser.
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('app://markloom/') && !(DEV_URL && url.startsWith(DEV_URL))) {
      event.preventDefault();
      if (/^(https?|mailto):/.test(url)) shell.openExternal(url);
    }
  });

  // Open external links in the user's default browser instead of a new Electron window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    // Linked local files (PDFs, images) are passed as blob URLs: show them in an app window
    if (url.startsWith('blob:')) return { action: 'allow' };
    if (/^(https?|mailto):/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // A reload starts a fresh page that must ask for pending files again
  win.webContents.on('did-start-loading', () => {
    rendererReady = false;
  });

  if (DEV_URL) {
    win.loadURL(DEV_URL);
  } else {
    win.loadURL('app://markloom/');
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // macOS delivers files through this event, possibly before the app is ready
  app.on('open-file', (event, filePath) => {
    event.preventDefault();
    if (app.isReady()) openDocuments([filePath]);
    else pendingFiles.push(filePath);
  });

  app.on('second-instance', (_event, argv) => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
    openDocuments(documentsIn(argv));
  });

  app.whenReady().then(() => {
    loadTrust();
    pendingFiles.forEach(trustFolderOf);
    openDocuments(documentsIn(process.argv));
    setUpSpellCheck();
    registerAppProtocol();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
