import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs/promises'
import { randomUUID } from 'node:crypto'

type SaveFilePayload = {
  defaultPath: string
  data: Uint8Array
  filters?: { name: string; extensions: string[] }[]
}

type SaveFileResult = {
  saved: boolean
  path?: string
}

type AssetFile = {
  id: string
  name: string
  size?: number
}

type FileFilter = { name: string; extensions: string[] }

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const devServerUrl = process.env.VITE_DEV_SERVER_URL

const getAssetsDir = async () => {
  const assetsDir = path.join(app.getPath('userData'), 'assets')
  await fs.mkdir(assetsDir, { recursive: true })
  return assetsDir
}

const createMainWindow = async () => {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#f3eee7',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (devServerUrl) {
    await mainWindow.loadURL(devServerUrl)
  } else {
    await mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

ipcMain.handle(
  'save-file',
  async (_event, payload: SaveFilePayload): Promise<SaveFileResult> => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: payload.defaultPath,
      filters: payload.filters,
    })
    if (canceled || !filePath) {
      return { saved: false }
    }
    await fs.writeFile(filePath, Buffer.from(payload.data))
    return { saved: true, path: filePath }
  },
)

ipcMain.handle(
  'pick-files',
  async (
    _event,
    options?: { filters?: FileFilter[] },
  ): Promise<AssetFile[]> => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: options?.filters,
    })
    if (result.canceled || result.filePaths.length === 0) {
      return []
    }
    const assetsDir = await getAssetsDir()
    const picked: AssetFile[] = []
  for (const filePath of result.filePaths) {
    const id = randomUUID()
    const destination = path.join(assetsDir, id)
    await fs.copyFile(filePath, destination)
    const stats = await fs.stat(filePath)
    picked.push({
      id,
      name: path.basename(filePath),
      size: stats.size,
      })
    }
    return picked
  },
)

ipcMain.handle(
  'read-asset',
  async (_event, assetId: string): Promise<Uint8Array | null> => {
    if (
      assetId.includes('/') ||
      assetId.includes('\\') ||
      assetId.includes('..')
    ) {
      return null
    }
    const assetsDir = await getAssetsDir()
    try {
      const data = await fs.readFile(path.join(assetsDir, assetId))
      return new Uint8Array(data)
    } catch {
      return null
    }
  },
)

ipcMain.handle(
  'open-external',
  async (_event, url: string): Promise<boolean> => {
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return false
    }
    if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol)) {
      return false
    }
    await shell.openExternal(url)
    return true
  },
)

app.whenReady().then(() => {
  void createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
