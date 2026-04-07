# parakeet-electron
# 🦜 ParakeetAI — Windows Desktop App

AI Interview Assistant with **true OS-level stealth** on Windows.

## Features

| Feature | How it works |
|---|---|
| **Invisible on screen share** | `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)` — OS graphics layer exclusion |
| **Hidden from taskbar** | `skipTaskbar: true` — lives in system tray only |
| **Always on top** | Floats above Zoom, Teams, Meet, WebEx at `screen-saver` level |
| **No Alt+Tab thumbnail** | Frameless + skipTaskbar combo |
| **Global hotkeys** | Work even when window is hidden |
| **Real speech recognition** | Web Speech API (Chromium built-in) |
| **Claude AI answers** | API key stored locally, calls made from main process |

## Supported Platforms (Screen Share Invisible)

✅ Zoom · ✅ Microsoft Teams · ✅ Google Meet · ✅ WebEx  
✅ Amazon Chime · ✅ Lark/Feishu · ✅ CoderPad · ✅ HackerRank

---

## Setup

### 1. Prerequisites
- [Node.js](https://nodejs.org) v18 or higher
- Windows 10 or 11 (for WDA_EXCLUDEFROMCAPTURE API)

### 2. Install dependencies
```bash
npm install
```

### 3. Add your Anthropic API key
Launch the app, go to ⚙ **Settings**, paste your API key (`sk-ant-api03-...`) and click Save.

Get a key at: https://console.anthropic.com

### 4. Run in development
```bash
npm start
```

### 5. Build installer for Windows
```bash
npm run build
```
Produces `dist/ParakeetAI-Setup.exe` (NSIS installer) and `dist/ParakeetAI-portable.exe`.

---

## Usage

1. Launch ParakeetAI — it appears as a small floating window + system tray icon
2. Click **▶ Start** to begin a session
3. Click the **🎤 mic button** — grant microphone permission when prompted
4. Speak (or let your interviewer speak) — the app listens continuously
5. When speech ends, it sends the question to Claude and streams the answer
6. Or type a question manually and press Enter

## Global Hotkeys

| Hotkey | Action |
|---|---|
| `Ctrl+Shift+P` | Show / hide window |
| `Ctrl+Shift+A` | Start listening (from anywhere) |
| `Ctrl+Shift+H` | **Panic hide** — instantly hides window |

## How Stealth Works (Technical)

On Windows, `SetWindowDisplayAffinity` with the `WDA_EXCLUDEFROMCAPTURE` flag (0x00000011) tells the Windows Desktop Window Manager (DWM) to exclude the window from all capture surfaces. This operates at the **DirectX/DXGI** level — below where screen recording software hooks in. Result: the window is literally invisible to:

- Zoom's screen capture engine
- Microsoft Teams (which uses DXGI desktop duplication)
- Google Meet (WebRTC `getDisplayMedia`)
- OBS Studio
- Windows Game Bar
- Any proctoring software using `BitBlt`, `PrintWindow`, or DXGI

Electron exposes this via `BrowserWindow.setContentProtection(true)`.

## File Structure

```
parakeet-electron/
├── src/
│   ├── main.js          # Electron main process (stealth window, IPC, tray)
│   ├── preload.js       # Secure context bridge
│   └── renderer.html    # Full UI (speech, AI, notes, settings)
├── assets/
│   └── icon.png         # App icon (add your own 256x256 PNG)
├── package.json
└── README.md
```

## Adding an Icon

Place a 256×256 PNG at `assets/icon.png` and `assets/tray-icon.png`.  
For the Windows installer, place a 256×256 ICO at `assets/icon.ico`.

You can convert a PNG to ICO using: https://convertio.co/png-ico/
