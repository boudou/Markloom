// Electron main process: wraps the Markloom web build in a native desktop window.
const { app, BrowserWindow, protocol, net, shell, dialog, ipcMain, Menu, Tray, nativeImage, session } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { pathToFileURL } = require('url');

const DEV_URL = process.env.VITE_DEV_SERVER_URL;

// The app's own page: the packaged build, or the dev server while developing
function isAppUrl(url) {
  if (url.startsWith('app://markloom/')) return true;
  if (!DEV_URL) return false;
  try {
    return new URL(url).origin === new URL(DEV_URL).origin;
  } catch {
    return false;
  }
}

// Only the app's page (its top frame) may use the desktop bridge. A frame that navigated away
// or is gone (`senderFrame` null) is refused.
function assertFromApp(event) {
  const frame = event.senderFrame;
  if (!frame || frame.parent !== null || !isAppUrl(frame.url)) {
    throw new Error('Markloom refused a request from outside the app');
  }
}

function openInBrowser(url) {
  if (/^(https?|mailto):/.test(url)) shell.openExternal(url);
}

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
    if (!filePath.startsWith(DIST_DIR + path.sep) || pathname === '/') {
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
  const win = mainWindow;
  if (win && rendererReady) win.webContents.send('open-files', files);
  else pendingFiles.push(...files);
}

ipcMain.handle('take-pending-files', (event) => {
  assertFromApp(event);
  rendererReady = true;
  return pendingFiles.splice(0);
});

// The bytes and their modified time in one call. Stat comes first: a write between the two
// then costs one extra re-read later, never a new time on old bytes (a stale image for good)
ipcMain.handle('read-file', async (event, filePath) => {
  assertFromApp(event);
  const file = await fs.promises.open(await assertTrusted(filePath, canRead), 'r');
  try {
    const { mtimeMs } = await file.stat();
    return { bytes: await file.readFile(), mtimeMs };
  } finally {
    await file.close();
  }
});

// Lets the preview check whether an image changed without reading it
ipcMain.handle('stat-file', async (event, filePath) => {
  assertFromApp(event);
  const { mtimeMs, size } = await fs.promises.stat(await assertTrusted(filePath, canRead));
  return { mtimeMs, size };
});

ipcMain.handle('write-file', async (event, filePath, data) => {
  assertFromApp(event);
  if (typeof data !== 'string' && !(data instanceof Uint8Array)) throw new Error('Unsupported file contents');
  const target = await assertTrusted(filePath, canWrite);
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  await fs.promises.writeFile(target, data);
});

// ---------------------------------------------------------------------------
// PDF export: Chromium's own print engine gives selectable vector text and real page
// breaks. The HTML arrives already rendered (diagrams as SVG), so scripts stay off.

// The page being printed comes from a document, so it gets no way to reach local files: its
// own session lets through only the page itself, embedded data and web images (an <iframe>
// of file:///…/id_rsa would otherwise end up in the PDF), and a CSP says the same in the page.
const PRINT_CSP = "default-src 'none'; img-src data: https: http:; font-src data:; style-src 'unsafe-inline'";
const MAX_PRINT_HTML = 256 * 1024 * 1024;
const PAGE_SIZES = new Set(['A3', 'A4', 'A5', 'Legal', 'Letter', 'Tabloid']);
// The renderer sends the margins in inches (0 for PDF export, whose page boxes carry the
// margins); this copy of pageGeometry.ts's 18mm/16mm is used only when they're missing or invalid.
const DEFAULT_PRINT_MARGINS = { top: 18 / 25.4, right: 16 / 25.4, bottom: 18 / 25.4, left: 16 / 25.4 };
const MAX_PRINT_MARGIN = 2;
const printablePages = new Set();

function printMargins(margins) {
  const sides = ['top', 'right', 'bottom', 'left'];
  const valid =
    margins !== null &&
    typeof margins === 'object' &&
    sides.every((side) => {
      const value = margins[side];
      return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_PRINT_MARGIN;
    });
  const { top, right, bottom, left } = valid ? margins : DEFAULT_PRINT_MARGINS;
  return { marginType: 'custom', top, right, bottom, left };
}
let printSession;

function getPrintSession() {
  if (!printSession) {
    printSession = session.fromPartition('markloom-print');
    printSession.webRequest.onBeforeRequest(({ url }, callback) => {
      const allowed = printablePages.has(url) || /^(data|https?):/.test(url);
      callback({ cancel: !allowed });
    });
  }
  return printSession;
}

ipcMain.handle('print-pdf', async (event, html, options = {}) => {
  assertFromApp(event);
  if (typeof html !== 'string' || html.length > MAX_PRINT_HTML) throw new Error('Nothing printable');
  const secured = html.replace(/<head>/i, `<head>\n<meta http-equiv="Content-Security-Policy" content="${PRINT_CSP}">`);
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'markloom-print-'));
  const tempFile = path.join(tempDir, 'document.html');
  const pageUrl = pathToFileURL(tempFile).href;
  await fs.promises.writeFile(tempFile, secured, 'utf8');
  printablePages.add(pageUrl);
  const printer = new BrowserWindow({
    show: false,
    webPreferences: { javascript: false, sandbox: true, contextIsolation: true, session: getPrintSession() },
  });
  try {
    await printer.loadURL(pageUrl);
    return await printer.webContents.printToPDF({
      pageSize: PAGE_SIZES.has(options?.pageSize) ? options.pageSize : 'A4',
      landscape: options?.landscape === true,
      printBackground: true,
      margins: printMargins(options?.margins),
    });
  } finally {
    printablePages.delete(pageUrl);
    printer.destroy();
    fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
});

// ---------------------------------------------------------------------------
// window.open from the page. Linked local files arrive as blob: URLs of the app's page (the
// renderer opens only images, PDFs and plain text). Their windows get no preload and no
// JavaScript, except PDFs, whose viewer needs scripts; the renderer tags those `#pdf`.

function handleWindowOpen({ url }) {
  if (url.startsWith('blob:') && isAppUrl(url.slice('blob:'.length))) {
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        webPreferences: {
          preload: undefined,
          javascript: url.endsWith('#pdf'),
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
        },
      },
    };
  }
  // External links open in the user's default browser instead of a new Electron window
  openInBrowser(url);
  return { action: 'deny' };
}

// A linked file's window stays on that file: its links (a PDF's, say) open in the browser.
// Its first load, started by the app's page, also comes through will-navigate.
function guardLinkedFileWindow(child, { url: fileUrl }) {
  child.webContents.on('will-navigate', (event, url) => {
    if (url === fileUrl) return;
    event.preventDefault();
    openInBrowser(url);
  });
  child.webContents.setWindowOpenHandler(({ url }) => {
    openInBrowser(url);
    return { action: 'deny' };
  });
}

// ---------------------------------------------------------------------------
// Window preferences and the tray. Main keeps the two toggles in its own file so it has them
// before the page loads; the page changes them through update-window-prefs.

const WINDOW_PREF_KEYS = ['minimizeToTray', 'closeToTray'];
const windowPrefsFile = () => path.join(app.getPath('userData'), 'window-prefs.json');
let windowPrefs = { minimizeToTray: false, closeToTray: false };

function loadWindowPrefs() {
  try {
    const saved = JSON.parse(fs.readFileSync(windowPrefsFile(), 'utf8'));
    windowPrefs = {
      minimizeToTray: saved?.minimizeToTray === true,
      closeToTray: saved?.closeToTray === true,
    };
  } catch {
    windowPrefs = { minimizeToTray: false, closeToTray: false };
  }
}

function saveWindowPrefs() {
  try {
    fs.writeFileSync(windowPrefsFile(), JSON.stringify(windowPrefs));
  } catch {
    // Not fatal: the toggles still apply for this session
  }
}

// The editor window (not a linked-file or printer window)
let mainWindow = null;
let tray = null;
// The window was hidden by minimize or close to tray
let hiddenToTray = false;
// A real quit is under way: closing must close, not hide
let quitting = false;

ipcMain.handle('update-window-prefs', (event, changes) => {
  assertFromApp(event);
  let changed = false;
  for (const key of WINDOW_PREF_KEYS) {
    const value = changes?.[key];
    if (typeof value === 'boolean' && value !== windowPrefs[key]) {
      windowPrefs[key] = value;
      changed = true;
    }
  }
  if (changed) {
    saveWindowPrefs();
    updateTray();
  }
  return { ...windowPrefs };
});

function trayIcon() {
  const file = path.join(__dirname, '..', DEV_URL ? 'public' : 'dist', 'icon-192.png');
  return nativeImage.createFromPath(file).resize({ width: 16, height: 16 });
}

// The icon exists while either toggle is on, or while the window is hidden
function updateTray() {
  const wanted = windowPrefs.minimizeToTray || windowPrefs.closeToTray || hiddenToTray;
  if (wanted && !tray) {
    tray = new Tray(trayIcon());
    tray.setToolTip('Markloom');
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Show Markloom', click: showMainWindow },
        { type: 'separator' },
        { label: 'Quit', click: () => app.quit() },
      ])
    );
    tray.on('click', showMainWindow);
  } else if (!wanted && tray) {
    tray.destroy();
    tray = null;
  }
}

// The tray icon exists before the window disappears, so there is always a way back
function hideToTray() {
  if (!mainWindow) return;
  hiddenToTray = true;
  updateTray();
  mainWindow.hide();
}

function showMainWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (hiddenToTray) mainWindow.show();
  mainWindow.focus();
  hiddenToTray = false;
  updateTray();
}

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

  mainWindow = win;
  // A window hidden to tray before its first paint stays hidden
  win.once('ready-to-show', () => {
    if (!hiddenToTray) win.show();
  });
  win.on('closed', () => {
    mainWindow = null;
  });

  // Minimizing can't be prevented, so the window hides once it has minimized
  win.on('minimize', () => {
    if (windowPrefs.minimizeToTray) hideToTray();
  });
  // 'close' comes before the page's beforeunload, so a hidden window closes no document
  win.on('close', (event) => {
    if (windowPrefs.closeToTray && !quitting) {
      event.preventDefault();
      hideToTray();
    }
  });
  // Windows shutdown and logoff skip before-quit
  win.on('session-end', () => {
    quitting = true;
  });

  win.webContents.on('context-menu', (_event, params) => {
    contextMenuFor(win, params)?.popup({ window: win });
  });

  // The renderer blocks unload while documents have unsaved changes; ask before discarding them.
  // A quit from the tray reaches here with the window hidden: show it so the prompt is seen.
  win.webContents.on('will-prevent-unload', (event) => {
    if (!win.isVisible()) showMainWindow();
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
    // Keep editing cancels the quit: the next close hides again
    else quitting = false;
  });

  // The app never navigates its own window; links open in a tab, a new window, or the browser.
  win.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) {
      event.preventDefault();
      openInBrowser(url);
    }
  });

  win.webContents.setWindowOpenHandler(handleWindowOpen);
  win.webContents.on('did-create-window', guardLinkedFileWindow);

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
    if (app.isReady()) {
      openDocuments([filePath]);
      if (hiddenToTray) showMainWindow();
    } else {
      pendingFiles.push(filePath);
    }
  });

  app.on('second-instance', (_event, argv) => {
    if (mainWindow) showMainWindow();
    openDocuments(documentsIn(argv));
  });

  app.on('before-quit', () => {
    quitting = true;
  });
  // An icon left behind on Windows lingers until hovered
  app.on('will-quit', () => tray?.destroy());

  app.whenReady().then(() => {
    loadTrust();
    loadWindowPrefs();
    pendingFiles.forEach(trustFolderOf);
    openDocuments(documentsIn(process.argv));
    setUpSpellCheck();
    registerAppProtocol();
    createWindow();
    updateTray();
    app.on('activate', () => {
      if (!mainWindow) createWindow();
      else if (hiddenToTray) showMainWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
