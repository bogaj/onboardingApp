import { contextBridge, ipcRenderer } from 'electron'

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

contextBridge.exposeInMainWorld('electronAPI', {
  saveFile: (payload: SaveFilePayload): Promise<SaveFileResult> =>
    ipcRenderer.invoke('save-file', payload),
  pickFiles: (options?: { filters?: FileFilter[] }): Promise<AssetFile[]> =>
    ipcRenderer.invoke('pick-files', options),
  readAsset: (assetId: string): Promise<Uint8Array | null> =>
    ipcRenderer.invoke('read-asset', assetId),
  openExternal: (url: string): Promise<boolean> =>
    ipcRenderer.invoke('open-external', url),
})
