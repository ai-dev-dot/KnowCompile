const api = window.electronAPI

export function useIPC() {
  return {
    // KB
    initKB: (path: string) =>
      api.invoke('kb:init', path) as Promise<{ success: boolean; error?: string }>,
    getKBPath: () =>
      api.invoke('kb:get-path') as Promise<string | null>,
    setKBPath: (path: string) =>
      api.invoke('kb:set-path', path) as Promise<{ success: boolean }>,
    selectKBPath: () =>
      api.invoke('kb:select') as Promise<string | null>,

    // Wiki
    listWikiPages: (kbPath: string) =>
      api.invoke('wiki:list', kbPath) as Promise<{ name: string; path: string; modifiedAt: string }[]>,
    readWikiPage: (filePath: string) =>
      api.invoke('wiki:read', filePath) as Promise<string>,
    writeWikiPage: (filePath: string, content: string) =>
      api.invoke('wiki:write', filePath, content) as Promise<{ success: boolean }>,
    deleteWikiPage: (filePath: string) =>
      api.invoke('wiki:delete', filePath) as Promise<{ success: boolean }>,
    getBacklinks: (kbPath: string, pageName: string) =>
      api.invoke('wiki:backlinks', kbPath, pageName) as Promise<string[]>,
    extractLinks: (content: string) =>
      api.invoke('wiki:extract-links', content) as Promise<string[]>,

    // Raw
    listRawFiles: (kbPath: string) =>
      api.invoke('raw:list', kbPath) as Promise<{ name: string; path: string; size: number; addedAt: string }[]>,
    copyToRaw: (kbPath: string, sourcePath: string) =>
      api.invoke('raw:copy', kbPath, sourcePath) as Promise<{ success: boolean; name?: string; error?: string }>,
    readRawFile: (filePath: string) =>
      api.invoke('raw:read', filePath) as Promise<string>,

    // Schema
    listSchema: (kbPath: string) =>
      api.invoke('schema:list', kbPath) as Promise<{ name: string; content: string }[]>,
    writeSchema: (filePath: string, content: string) =>
      api.invoke('schema:write', filePath, content) as Promise<{ success: boolean }>,

    // Generic invoke for handlers not yet typed
    invoke: (channel: string, ...args: unknown[]) =>
      api.invoke(channel, ...args),
  }
}
