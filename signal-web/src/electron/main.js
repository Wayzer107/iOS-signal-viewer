const { app, BrowserWindow, dialog, Menu } = require('electron')
const path = require('path')
const fs = require('fs')

const isDev = process.env.VITE_DEV === 'true'
const prefsPath = path.join(app.getPath('userData'), 'prefs.json')

function loadPrefs() {
  try { return JSON.parse(fs.readFileSync(prefsPath, 'utf8')) } catch { return {} }
}
function savePrefs(prefs) {
  fs.writeFileSync(prefsPath, JSON.stringify(prefs, null, 2))
}

let mainWindow = null
let currentServer = null
let currentDb = null

async function pickDbFile() {
  const { filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Signal Archive',
    filters: [{ name: 'SQLite Database', extensions: ['sqlite', 'db'] }],
    properties: ['openFile'],
  })
  return filePaths[0] || null
}

async function openArchive(dbPath) {
  if (!dbPath) return false
  const { startServer } = require('../server/index.js')

  if (currentServer) {
    currentServer.close()
    if (currentDb) currentDb.close()
  }

  try {
    const { server, port, db } = await startServer(dbPath, 0)
    currentServer = server
    currentDb = db
    savePrefs({ ...loadPrefs(), dbPath })
    if (mainWindow) mainWindow.loadURL(`http://localhost:${port}`)
    return true
  } catch (err) {
    dialog.showErrorBox('Failed to open archive', err.message)
    return false
  }
}

function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Archive…',
          accelerator: 'CmdOrCtrl+O',
          async click() {
            const p = await pickDbFile()
            if (p) await openArchive(p)
          },
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(async () => {
  buildMenu()

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 800,
    minHeight: 600,
    title: 'Signal Archive',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    const prefs = loadPrefs()
    let dbPath = prefs.dbPath
    if (!dbPath || !fs.existsSync(dbPath)) dbPath = await pickDbFile()
    if (dbPath) await openArchive(dbPath)
    else app.quit()
  }
})

app.on('window-all-closed', () => {
  if (currentServer) currentServer.close()
  if (currentDb) currentDb.close()
  app.quit()
})
