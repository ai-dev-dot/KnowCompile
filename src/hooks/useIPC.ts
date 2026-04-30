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

    // Settings
    getSettings: () =>
      api.invoke('settings:get') as Promise<any>,
    saveSettings: (settings: any) =>
      api.invoke('settings:save', settings) as Promise<{ success: boolean }>,

    // LLM
    testLLM: (settings: { provider: string; apiKey: string; baseURL: string; model: string }) =>
      api.invoke('llm:test', settings) as Promise<{ success: boolean; message: string }>,
    compile: (kbPath: string, rawFilePath: string) =>
      api.invoke('llm:compile', kbPath, rawFilePath) as Promise<string>,
    qa: (kbPath: string, question: string, contextPages: string[]) =>
      api.invoke('llm:qa', kbPath, question, contextPages) as Promise<string>,

    // Search
    buildSearchIndex: (kbPath: string) =>
      api.invoke('search:build', kbPath) as Promise<{ success: boolean; count?: number }>,
    search: (query: string) =>
      api.invoke('search:query', query) as Promise<{ name: string }[]>,

    // Graph
    getGraphData: (kbPath: string) =>
      api.invoke('graph:data', kbPath) as Promise<{ nodes: { id: string; label: string; linkCount: number }[]; edges: { source: string; target: string }[] }>,

    // Samples
    loadSamples: (kbPath: string) =>
      api.invoke('samples:load', kbPath) as Promise<{ success: boolean; count?: number }>,
    deleteSamples: (kbPath: string) =>
      api.invoke('samples:delete', kbPath) as Promise<{ success: boolean; deletedPages?: string[] }>,
    trackSamplePage: (kbPath: string, pageName: string) =>
      api.invoke('samples:track-page', kbPath, pageName) as Promise<{ success: boolean }>,
    checkSamples: (kbPath: string) =>
      api.invoke('samples:check', kbPath) as Promise<{ loaded: boolean }>,

    // Export
    exportHTML: (kbPath: string) =>
      api.invoke('export:html', kbPath) as Promise<{ success: boolean; path?: string; error?: string }>,
    exportMarkdown: (kbPath: string) =>
      api.invoke('export:markdown', kbPath) as Promise<{ success: boolean; path?: string; error?: string }>,
    backup: (kbPath: string) =>
      api.invoke('export:backup', kbPath) as Promise<{ success: boolean; path?: string; error?: string }>,

    // Generic invoke for handlers not yet typed
    invoke: (channel: string, ...args: unknown[]) =>
      api.invoke(channel, ...args),
  }
}
