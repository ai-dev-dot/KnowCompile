import './env-setup' // must be first — limits ONNX thread pool
import { app, BrowserWindow, Menu, ipcMain } from 'electron'
import path from 'path'
import { registerIPCHandlers } from './ipc-handlers'

let mainWindow: BrowserWindow | null = null

// ---------------------------------------------------------------------------
// Event-loop lag monitor — detects main-process jank
// ---------------------------------------------------------------------------
const lagSamples: { time: number; delay: number }[] = []
const MAX_LAG_SAMPLES = 200
let lastLagCheck = process.hrtime.bigint()
const lagTimer = setInterval(() => {
  const now = process.hrtime.bigint()
  const elapsed = Number(now - lastLagCheck) / 1e6 // ms
  lastLagCheck = now
  // expected ~100 ms; >500 ms means a significant block worth logging
  if (elapsed > 500) {
    const sample = { time: Date.now(), delay: Math.round(elapsed) }
    lagSamples.push(sample)
    if (lagSamples.length > MAX_LAG_SAMPLES) lagSamples.shift()
    console.warn(`[main-lag] event loop blocked for ${elapsed.toFixed(0)} ms`)
  } else if (elapsed > 130) {
    const sample = { time: Date.now(), delay: Math.round(elapsed) }
    lagSamples.push(sample)
    if (lagSamples.length > MAX_LAG_SAMPLES) lagSamples.shift()
  }
}, 100)
lagTimer.unref() // don't keep the process alive

ipcMain.handle('diagnostics:main-lag', () => {
  return lagSamples.slice()
})

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: '知译 KnowCompile',
    backgroundColor: '#1e1e2e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

registerIPCHandlers()

Menu.setApplicationMenu(null)

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
