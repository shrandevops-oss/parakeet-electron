/**
 * GhostMind - Main Process (Windows)
 * 
 * Stealth techniques used:
 * 1. setContentProtection(true)  → excludes window from ALL screen capture (OBS, Zoom, Teams, Meet, etc.)
 * 2. setSkipTaskbar(true)        → hides from Windows taskbar
 * 3. setAlwaysOnTop(true, 'screen-saver') → floats above all apps including fullscreen
 * 4. Custom frameless window     → no title bar visible in Alt+Tab thumbnails
 * 5. System tray only icon       → app lives in tray, not taskbar
 * 6. Process name disguise       → rename process to look like a system service
 */

const { app, BrowserWindow, ipcMain, Tray, Menu, globalShortcut } = require('electron');
const path = require('path');
const fetch = require('node-fetch');
const fs = require('fs');

// ── Disguise process name (appears as "RuntimeBroker" in Task Manager on Windows)
// Uncomment the line below to enable process name disguise:
// app.setName('RuntimeBroker');

let mainWindow = null;
let tray = null;
let isVisible = true;
let apiKey = '';

// ── Load saved API key
const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
      const cfg = JSON.parse(raw);
      if (cfg && typeof cfg === 'object' && typeof cfg.apiKey === 'string') {
        apiKey = cfg.apiKey;
      }
    }
  } catch (e) { console.error('Config load error:', e.message); }
}
function saveConfig(cfg) {
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return;
  try {
    let existing = {};
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        existing = parsed;
      }
    }
    // Only allow known keys to prevent prototype pollution
    const allowed = ['apiKey'];
    const safe = {};
    for (const k of allowed) {
      if (k in cfg) safe[k] = cfg[k];
      else if (k in existing) safe[k] = existing[k];
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(safe, null, 2));
  } catch (e) { console.error('Config save error:', e.message); }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 480,
    height: 780,
    minWidth: 380,
    minHeight: 500,

    // ── STEALTH: No frame, no title bar
    frame: false,
    transparent: true,

    // ── STEALTH: Hide from taskbar (lives in system tray only)
    skipTaskbar: true,

    // ── STEALTH: Always on top of other windows including video calls
    alwaysOnTop: true,
    alwaysOnTopLevel: 'screen-saver', // highest level - above fullscreen apps

    // ── STEALTH: Start slightly off-center so it doesn't cover primary content
    x: 20,
    y: 80,

    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      // Allow microphone access
      webSecurity: true,
    },

    // Don't show in taskbar or Alt+Tab
    show: false,
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
  });

  // ── STEALTH: Exclude from ALL screen capture
  // This is the key Windows API: SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)
  // Electron exposes this as setContentProtection
  mainWindow.setContentProtection(true);

  // ── STEALTH: Set window type to exclude from Alt+Tab switcher
  mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);

  // Set Content Security Policy — restricts what the renderer can load/execute
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src https://api.anthropic.com; img-src 'self' data:;"
        ]
      }
    });
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer.html'));

  // Show window smoothly once ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // Prevent window from appearing in screen share by re-asserting on focus
  mainWindow.on('focus', () => {
    mainWindow.setContentProtection(true);
  });

  // Don't close app when window is closed — minimize to tray
  mainWindow.on('close', (e) => {
    e.preventDefault();
    mainWindow.hide();
  });
}

function createTray() {
  // Use a simple PNG for tray icon (create a placeholder if missing)
  const iconPath = path.join(__dirname, '..', 'assets', 'tray-icon.png');
  
  const fallbackIcon = path.join(__dirname, '..', 'assets', 'icon.png');
  try {
    tray = new Tray(iconPath);
  } catch (e) {
    try {
      tray = new Tray(fallbackIcon);
    } catch (e2) {
      console.error('Could not create tray icon — ensure assets/icon.png exists:', e2.message);
      return; // Skip tray setup entirely rather than crash
    }
  }

  tray.setToolTip('GhostMind - Interview Assistant');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '👻 GhostMind',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Show / Hide  (Ctrl+Shift+P)',
      click: () => toggleVisibility(),
    },
    {
      label: 'Toggle Stealth Mode',
      click: () => {
        if (mainWindow) {
          const protected_ = mainWindow.isContentProtected
            ? !mainWindow.isContentProtected()
            : true;
          mainWindow.setContentProtection(protected_);
          tray.setToolTip(protected_
            ? 'GhostMind - STEALTH ON'
            : 'GhostMind - STEALTH OFF (visible on screen share)');
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  // Single click tray icon to show/hide
  tray.on('click', () => toggleVisibility());
}

function toggleVisibility() {
  if (!mainWindow) return;
  if (mainWindow.isVisible()) {
    mainWindow.hide();
    isVisible = false;
  } else {
    mainWindow.show();
    mainWindow.focus();
    isVisible = true;
  }
}

// ── Register global hotkeys (work even when window is hidden)
function registerShortcuts() {
  // Show/hide with Ctrl+Shift+P
  globalShortcut.register('CommandOrControl+Shift+P', () => {
    toggleVisibility();
  });

  // Quick answer with Ctrl+Shift+A
  globalShortcut.register('CommandOrControl+Shift+A', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.webContents.send('trigger-listen');
    }
  });

  // Panic hide with Ctrl+Shift+H
  globalShortcut.register('CommandOrControl+Shift+H', () => {
    if (mainWindow) mainWindow.hide();
  });
}

// ── IPC Handlers (renderer <-> main communication)

// Claude API call (done in main process — API key never exposed to renderer)
ipcMain.handle('claude-api', async (event, payload) => {
  if (!apiKey) {
    return { error: 'No API key set. Go to Settings to add your Anthropic API key.' };
  }
  // Validate payload shape
  if (!payload || typeof payload !== 'object') return { error: 'Invalid request payload.' };
  const question = typeof payload.question === 'string' ? payload.question.slice(0, 2000) : '';
  const systemPrompt = typeof payload.systemPrompt === 'string' ? payload.systemPrompt.slice(0, 8000) : '';
  if (!question.trim()) return { error: 'Empty question.' };

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: question }],
      }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return { error: err?.error?.message || `API error ${response.status}` };
    }
    const data = await response.json();
    const text = data.content?.[0]?.text;
    if (typeof text !== 'string') return { error: 'Unexpected API response format.' };
    return { text };
  } catch (e) {
    return { error: e.message };
  }
});

// Save API key securely in userData folder
ipcMain.handle('save-api-key', async (event, key) => {
  if (typeof key !== 'string' || !key.startsWith('sk-ant-') || key.length > 300 || key.length < 20) {
    return { ok: false, error: 'Invalid API key format.' };
  }
  // Strip any whitespace
  const cleanKey = key.trim();
  apiKey = cleanKey;
  saveConfig({ apiKey: cleanKey });
  return { ok: true };
});

// Get saved API key (masked)
ipcMain.handle('get-api-key', async () => {
  return apiKey ? apiKey.slice(0, 8) + '...' + apiKey.slice(-4) : '';
});

// Window controls
ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-hide', () => mainWindow?.hide());
ipcMain.on('window-move', (event, payload) => {
  if (!mainWindow || !payload) return;
  const x = typeof payload.x === 'number' && isFinite(payload.x) ? Math.round(payload.x) : 0;
  const y = typeof payload.y === 'number' && isFinite(payload.y) ? Math.round(payload.y) : 0;
  const [cx, cy] = mainWindow.getPosition();
  // Clamp to reasonable bounds to prevent window going off-screen
  const nx = Math.max(-200, Math.min(cx + x, 9999));
  const ny = Math.max(0, Math.min(cy + y, 9999));
  mainWindow.setPosition(nx, ny);
});

// Toggle stealth from renderer
ipcMain.handle('toggle-stealth', async (event, enable) => {
  if (mainWindow) {
    const shouldEnable = enable === true; // strict boolean — prevent truthy coercion
    mainWindow.setContentProtection(shouldEnable);
    return { ok: true, stealth: shouldEnable };
  }
  return { ok: false };
});

// ── App lifecycle
app.whenReady().then(() => {
  loadConfig();
  createWindow();
  createTray();
  registerShortcuts();

  // Prevent app from appearing in Alt+Tab by not registering a taskbar button
  // (skipTaskbar handles this on Windows)
});

app.on('window-all-closed', (e) => {
  // Don't quit — stay in tray
  e.preventDefault();
});

app.on('before-quit', () => {
  app.isQuitting = true;
  globalShortcut.unregisterAll();
});

// will-quit fires after before-quit; shortcuts already unregistered above
app.on('will-quit', () => { /* intentionally empty */ });
