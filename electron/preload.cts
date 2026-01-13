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

type LessonExportPayload = {
  folderName: string
  data: Uint8Array
}

type LessonExportResult = {
  saved: boolean
  path?: string
}

type LessonImportResult = {
  name: string
  data: Uint8Array
} | null

type WriteAssetPayload = {
  data: Uint8Array
}

type WriteAssetResult = {
  id: string
  size: number
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
  writeAsset: (payload: WriteAssetPayload): Promise<WriteAssetResult> =>
    ipcRenderer.invoke('write-asset', payload),
  saveLessonExport: (
    payload: LessonExportPayload,
  ): Promise<LessonExportResult> =>
    ipcRenderer.invoke('save-lesson-export', payload),
  openLessonExport: (): Promise<LessonImportResult> =>
    ipcRenderer.invoke('open-lesson-export'),
  openExternal: (url: string): Promise<boolean> =>
    ipcRenderer.invoke('open-external', url),
})
