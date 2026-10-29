// Electron main process: wraps the Markloom web build in a native desktop window.
const { app, BrowserWindow, protocol, net, shell, dialog, ipcMain, Menu, Tray, nativeImage, session, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { pathToFileURL } = require('url');
const { execFile } = require('child_process');

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
// Files opened from the OS (double-click, "Open with", drag onto the app icon), and folders
// passed on the command line. The page may read and write only inside folders the user opened
// a file from or handed over, or, for a file in a broad folder (home, a drive root), only that
// file and its assets/ folder. A broad folder itself is never opened.

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
  if (!(isInTrustedDir(real) || trustedFiles.has(real)) || !allowed(real)) throw denied;
  return real;
}

// Strictly inside a trusted folder (a trusted folder is not inside itself)
function isInTrustedDir(real) {
  return [...trustedDirs].some((dir) => real.startsWith(dir + path.sep));
}

let rendererReady = false;
const pendingFiles = [];
// The folder handed over before the page was ready (there is one open folder, so the last one wins)
let pendingFolder = null;
// macOS open-file paths that arrive before the app is ready
const earlyPaths = [];

// The paths on a command line, resolved against the directory it was run from. `electron .`
// (development) puts the app folder first, which must not be taken for a folder to open.
function launchPaths(argv, cwd) {
  return argv
    .slice(process.defaultApp ? 2 : 1)
    .filter((arg) => !arg.startsWith('-'))
    .map((arg) => path.resolve(cwd, arg));
}

function isDirectory(target) {
  try {
    return fs.statSync(target).isDirectory();
  } catch {
    return false;
  }
}

// Folders and documents from the OS or the command line: the folder is shown first, then the documents open
function openFromOs(paths) {
  const folders = paths.filter(isDirectory);
  const docs = paths.filter((p) => !isDirectory(p) && DOCUMENT_EXTENSIONS.test(p) && fs.existsSync(p));
  if (folders.length > 0) openFolder(folders[folders.length - 1]);
  openDocuments(docs);
}

function openDocuments(files) {
  if (files.length === 0) return;
  files.forEach(trustFolderOf);
  const win = mainWindow;
  if (win && rendererReady) win.webContents.send('open-files', files);
  else pendingFiles.push(...files);
}

// Trusts a folder handed over by the OS. The native real path gives the true case on Windows,
// which is what assertTrusted's fs.promises.realpath compares against (and what isBroadFolder needs).
function trustFolder(dir) {
  let real;
  try {
    real = fs.realpathSync.native(dir);
  } catch {
    return false;
  }
  if (isBroadFolder(real)) return false;
  if (!trustedDirs.has(real)) {
    trustedDirs.add(real);
    saveTrust();
  }
  return true;
}

// Sends the path as given, not its real path, so a document opened from the tree and the same
// document double-clicked in Explorer get the same desktop: path (and the same tab)
function openFolder(dir) {
  if (!trustFolder(dir)) {
    const options = {
      type: 'info',
      title: 'Markloom',
      message: `Markloom can't open ${dir} as a folder`,
      detail: 'A drive or your home folder holds far more than your documents. Open a folder inside it instead.',
    };
    if (mainWindow) dialog.showMessageBox(mainWindow, options);
    else dialog.showMessageBox(options);
    return;
  }
  const win = mainWindow;
  if (win && rendererReady) win.webContents.send('open-folder', dir);
  else pendingFolder = dir;
}

ipcMain.handle('take-pending-files', (event) => {
  assertFromApp(event);
  rendererReady = true;
  const folder = pendingFolder;
  pendingFolder = null;
  return { files: pendingFiles.splice(0), folder };
});

// One level of a trusted folder: its subfolders and the documents in it, as names only, so no
// symlink target's real path reaches the page. Hidden entries and node_modules are left out, and a
// symlink (or Windows junction) is listed only when its target is trusted too.
ipcMain.handle('list-folder', async (event, dirPath) => {
  assertFromApp(event);
  const denied = new Error('Markloom does not have access to that location');
  if (typeof dirPath !== 'string') throw denied;
  let real;
  try {
    real = await fs.promises.realpath(path.resolve(dirPath));
    if (!(trustedDirs.has(real) || isInTrustedDir(real))) throw denied;
    if (!(await fs.promises.stat(real)).isDirectory()) throw denied;
  } catch {
    throw denied;
  }

  const entries = [];
  for (const entry of await fs.promises.readdir(real, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const kind = await entryKind(path.join(real, entry.name), entry);
    if (kind === 'directory' && entry.name !== 'node_modules') {
      entries.push({ name: entry.name, isDirectory: true });
    } else if (kind === 'file' && DOCUMENT_EXTENSIONS.test(entry.name)) {
      entries.push({ name: entry.name, isDirectory: false });
    }
  }
  return entries;
});

// 'directory', 'file' or null (anything else, or a symlink leading outside the trusted folders)
async function entryKind(fullPath, entry) {
  if (!entry.isSymbolicLink()) {
    if (entry.isDirectory()) return 'directory';
    return entry.isFile() ? 'file' : null;
  }
  try {
    const target = await fs.promises.realpath(fullPath);
    if (!(trustedDirs.has(target) || isInTrustedDir(target))) return null;
    const stat = await fs.promises.stat(target);
    if (stat.isDirectory()) return 'directory';
    return stat.isFile() && DOCUMENT_EXTENSIONS.test(target) ? 'file' : null;
  } catch {
    return null;
  }
}

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
// Window preferences and the tray. Main keeps the tray toggles (and the Explorer menu's, below)
// in its own file so it has them before the page loads; the page changes the tray toggles
// through update-window-prefs. It keeps the appearance there too, so the window opens in the
// page's colours with no white frame.

const WINDOW_PREF_KEYS = ['minimizeToTray', 'closeToTray'];
const APPEARANCES = ['system', 'light', 'dark'];
// Keep in step with the appearance default in src/stores/settingsStore.ts
const DEFAULT_APPEARANCE = 'system';
const TITLE_BAR_HEIGHT = 44;
// --canvas, --panel and --text-secondary of each palette in src/styles/globals.css
const WINDOW_COLOURS = {
  light: { background: '#FFFFFF', overlay: '#F8F9FA', symbols: '#5A5A5A' },
  dark: { background: '#17191C', overlay: '#1E2024', symbols: '#B6BBC3' },
};
const DEFAULT_WINDOW_PREFS = { minimizeToTray: false, closeToTray: false, explorerMenu: false, appearance: DEFAULT_APPEARANCE };
const windowPrefsFile = () => path.join(app.getPath('userData'), 'window-prefs.json');
let windowPrefs = { ...DEFAULT_WINDOW_PREFS };

function loadWindowPrefs() {
  try {
    const saved = JSON.parse(fs.readFileSync(windowPrefsFile(), 'utf8'));
    windowPrefs = {
      minimizeToTray: saved?.minimizeToTray === true,
      closeToTray: saved?.closeToTray === true,
      explorerMenu: saved?.explorerMenu === true,
      appearance: APPEARANCES.includes(saved?.appearance) ? saved.appearance : DEFAULT_APPEARANCE,
    };
  } catch {
    windowPrefs = { ...DEFAULT_WINDOW_PREFS };
  }
}

// themeSource is the appearance, so shouldUseDarkColors is the resolved theme in every mode
function windowColours() {
  return nativeTheme.shouldUseDarkColors ? WINDOW_COLOURS.dark : WINDOW_COLOURS.light;
}

function applyWindowTheme() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const colours = windowColours();
  mainWindow.setBackgroundColor(colours.background);
  if (process.platform !== 'darwin') {
    mainWindow.setTitleBarOverlay({ color: colours.overlay, symbolColor: colours.symbols, height: TITLE_BAR_HEIGHT });
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
  // Checked before anything applies, so a bad appearance beside a valid toggle changes nothing
  const appearance = changes?.appearance;
  if (appearance !== undefined && !APPEARANCES.includes(appearance)) throw new Error('Unknown appearance');

  let changed = false;
  if (appearance !== undefined && appearance !== windowPrefs.appearance) {
    windowPrefs.appearance = appearance;
    // This emits 'updated' too; painting here as well keeps the change from depending on it
    nativeTheme.themeSource = appearance;
    applyWindowTheme();
    changed = true;
  }
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
  return { minimizeToTray: windowPrefs.minimizeToTray, closeToTray: windowPrefs.closeToTray };
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
// Explorer menu (Windows): per-user shell verbs written with reg.exe. The full path, so a reg.exe
// in the folder Markloom was started from is never run.

const REG_EXE = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'reg.exe');
const CLASSES = 'HKCU\\Software\\Classes';
const EXPLORER_MENU_ENTRIES = [
  ...['.md', '.markdown', '.mdx'].map((ext) => ({
    key: `${CLASSES}\\SystemFileAssociations\\${ext}\\shell\\Markloom`,
    label: 'Open with Markloom',
    arg: '%1',
  })),
  { key: `${CLASSES}\\Directory\\shell\\Markloom`, label: 'Open with Markloom', arg: '%1' },
  { key: `${CLASSES}\\Directory\\Background\\shell\\Markloom`, label: 'Open folder in Markloom', arg: '%V' },
];

// The exe the user keeps: the portable build runs from a folder it unpacks to on every start
const menuExe = () => process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;

// `electron .` (development) needs the app folder before the path, as launchPaths expects
const menuCommand = (arg) => `"${menuExe()}"${process.defaultApp ? ` "${app.getAppPath()}"` : ''} "${arg}"`;

// No shell: each argument reaches reg.exe as given
function reg(args) {
  return new Promise((resolve, reject) => {
    execFile(REG_EXE, args, { windowsHide: true }, (error, stdout) => (error ? reject(error) : resolve(stdout)));
  });
}

async function writeExplorerMenu() {
  for (const { key, label, arg } of EXPLORER_MENU_ENTRIES) {
    await reg(['add', key, '/ve', '/d', label, '/f']);
    await reg(['add', key, '/v', 'Icon', '/d', menuExe(), '/f']);
    await reg(['add', `${key}\\command`, '/ve', '/d', menuCommand(arg), '/f']);
  }
}

// Deleting a key that is already gone fails; that counts as done
async function removeExplorerMenu() {
  for (const { key } of EXPLORER_MENU_ENTRIES) {
    try {
      await reg(['delete', key, '/f']);
    } catch (error) {
      const stillThere = await reg(['query', key]).then(
        () => true,
        () => false
      );
      if (stillThere) throw error;
    }
  }
}

// The exe the folder entry runs, or null. reg.exe names the default value in the system
// language, so match the type, not "(Default)".
async function registeredMenuExe() {
  try {
    const stdout = await reg(['query', `${CLASSES}\\Directory\\shell\\Markloom\\command`, '/ve']);
    return /REG_SZ\s+"([^"]+)"/.exec(stdout)?.[1] ?? null;
  } catch {
    return null;
  }
}

// At startup: rewrite the entries when they are missing or their exe is gone (a moved portable
// build, a reinstall). Another copy whose exe still exists keeps them.
async function repairExplorerMenu() {
  const registered = await registeredMenuExe();
  if (registered && fs.existsSync(registered)) return;
  await writeExplorerMenu();
}

// One registry change at a time, so an on and an off never interleave their reg.exe calls
let explorerMenuWork = Promise.resolve();

function queueExplorerMenu(task) {
  const run = explorerMenuWork.then(task);
  explorerMenuWork = run.catch(() => {});
  return run;
}

// A boolean turns the menu on or off; anything else only reads
async function applyExplorerMenu(enabled) {
  if (typeof enabled === 'boolean' && enabled !== windowPrefs.explorerMenu) {
    if (enabled) {
      try {
        await writeExplorerMenu();
      } catch {
        // No half-written menu: the toggle stays off
        await removeExplorerMenu().catch(() => {});
        throw new Error("Markloom couldn't add the Explorer menu");
      }
    } else {
      try {
        await removeExplorerMenu();
      } catch {
        // The toggle stays on so the user can retry
        throw new Error("Markloom couldn't remove the Explorer menu");
      }
    }
    windowPrefs.explorerMenu = enabled;
    saveWindowPrefs();
  }

  return { enabled: windowPrefs.explorerMenu, portable: Boolean(process.env.PORTABLE_EXECUTABLE_FILE) };
}

ipcMain.handle('set-explorer-menu', (event, enabled) => {
  assertFromApp(event);
  if (process.platform !== 'win32') throw new Error('The Explorer menu is only on Windows');

  return queueExplorerMenu(() => applyExplorerMenu(enabled));
});

// ---------------------------------------------------------------------------
// Update check: main asks GitHub for the newest published release (no drafts or prereleases, by
// GitHub's definition of "latest"), so the page's CSP stays closed. Nothing is installed: the
// page links to the download, which opens in the system browser.

const RELEASES_API = 'https://api.github.com/repos/boudou/Markloom/releases/latest';
const RELEASE_URL_PREFIX = 'https://github.com/boudou/Markloom/releases/';
const UPDATE_CHECK_TIMEOUT_MS = 15000;

/** [major, minor, patch] from "v1.2.3" or "1.2.3-beta"; null when unreadable */
function parseVersion(text) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(text);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function isNewerVersion(candidate, current) {
  for (let i = 0; i < 3; i++) {
    if (candidate[i] !== current[i]) return candidate[i] > current[i];
  }
  return false;
}

const isReleaseUrl = (url) => typeof url === 'string' && url.startsWith(RELEASE_URL_PREFIX);

/** The fields used from a GitHub release: { version, page, assets: Map<name, url> }, or null */
function parseRelease(json) {
  const version = typeof json?.tag_name === 'string' ? parseVersion(json.tag_name) : null;
  if (!version || !isReleaseUrl(json.html_url)) return null;
  const assets = new Map();
  for (const asset of Array.isArray(json.assets) ? json.assets : []) {
    // An asset hosted anywhere else counts as missing
    if (typeof asset?.name === 'string' && isReleaseUrl(asset.browser_download_url)) {
      assets.set(asset.name, asset.browser_download_url);
    }
  }
  return { version, page: json.html_url, assets };
}

// Windows gets the file matching how the app was installed; elsewhere, or when it's missing, the release page
function downloadUrl(release) {
  if (process.platform !== 'win32') return release.page;
  const latest = release.version.join('.');
  const name = process.env.PORTABLE_EXECUTABLE_FILE ? `Markloom-${latest}.exe` : `Markloom-Setup-${latest}.exe`;
  return release.assets.get(name) ?? release.page;
}

// Errors thrown from a handler reach the page as a bare message, so failures are return values
ipcMain.handle('check-for-update', async (event) => {
  assertFromApp(event);
  const current = app.getVersion();
  let response;
  try {
    response = await net.fetch(RELEASES_API, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': `Markloom/${current}` },
      signal: AbortSignal.timeout(UPDATE_CHECK_TIMEOUT_MS),
    });
  } catch {
    // Any net:: failure, or no answer before the timeout
    return { ok: false, error: 'offline' };
  }
  const limited =
    response.status === 429 || (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0');
  if (limited) return { ok: false, error: 'rate-limited' };
  if (!response.ok) return { ok: false, error: 'other' };
  let release;
  try {
    release = parseRelease(await response.json());
  } catch {
    release = null;
  }
  if (!release) return { ok: false, error: 'other' };
  const running = parseVersion(current);
  return {
    ok: true,
    current,
    latest: release.version.join('.'),
    newer: running !== null && isNewerVersion(release.version, running),
    url: downloadUrl(release),
    checkedAt: Date.now(),
  };
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
  const colours = windowColours();
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 500,
    backgroundColor: colours.background,
    title: 'Markloom',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    show: false,
    // Hide the native frame and let the app's own TitleBar act as the window chrome.
    titleBarStyle: 'hidden',
    titleBarOverlay:
      process.platform === 'darwin'
        ? undefined
        : { color: colours.overlay, symbolColor: colours.symbols, height: TITLE_BAR_HEIGHT },
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
  // macOS delivers files and folders through this event, possibly before the app is ready
  app.on('open-file', (event, filePath) => {
    event.preventDefault();
    if (app.isReady()) {
      openFromOs([filePath]);
      if (hiddenToTray) showMainWindow();
    } else {
      earlyPaths.push(filePath);
    }
  });

  // A relative argument belongs to the second instance's working directory, not ours
  app.on('second-instance', (_event, argv, workingDirectory) => {
    if (mainWindow) showMainWindow();
    openFromOs(launchPaths(argv, workingDirectory));
  });

  app.on('before-quit', () => {
    quitting = true;
  });
  // An icon left behind on Windows lingers until hovered
  app.on('will-quit', () => tray?.destroy());

  app.whenReady().then(() => {
    loadTrust();
    loadWindowPrefs();
    nativeTheme.themeSource = windowPrefs.appearance;
    // Once, here: createWindow runs again on macOS activate. Covers OS theme changes under 'system'
    nativeTheme.on('updated', applyWindowTheme);
    openFromOs([...launchPaths(process.argv, process.cwd()), ...earlyPaths.splice(0)]);
    setUpSpellCheck();
    registerAppProtocol();
    createWindow();
    updateTray();
    if (process.platform === 'win32' && windowPrefs.explorerMenu) {
      queueExplorerMenu(repairExplorerMenu).catch((error) => console.error('Explorer menu repair failed:', error));
    }
    app.on('activate', () => {
      if (!mainWindow) createWindow();
      else if (hiddenToTray) showMainWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
