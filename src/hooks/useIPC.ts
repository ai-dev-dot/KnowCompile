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
    readWikiPage: (kbPath: string, subpath: string) =>
      api.invoke('wiki:read', kbPath, subpath) as Promise<string>,
    writeWikiPage: (kbPath: string, subpath: string, content: string) =>
      api.invoke('wiki:write', kbPath, subpath, content) as Promise<{ success: boolean }>,
    deleteWikiPage: (kbPath: string, subpath: string) =>
      api.invoke('wiki:delete', kbPath, subpath) as Promise<{ success: boolean }>,
    getBacklinks: (kbPath: string, pageName: string) =>
      api.invoke('wiki:backlinks', kbPath, pageName) as Promise<string[]>,
    extractLinks: (content: string) =>
      api.invoke('wiki:extract-links', content) as Promise<string[]>,

    // Raw
    listRawFiles: (kbPath: string) =>
      api.invoke('raw:list', kbPath) as Promise<{ name: string; path: string; size: number; addedAt: string }[]>,
    copyToRaw: (kbPath: string, sourcePath: string) =>
      api.invoke('raw:copy', kbPath, sourcePath) as Promise<{ success: boolean; name?: string; error?: string }>,
    readRawFile: (kbPath: string, subpath: string) =>
      api.invoke('raw:read', kbPath, subpath) as Promise<string>,

    // Schema
    listSchema: (kbPath: string) =>
      api.invoke('schema:list', kbPath) as Promise<{ name: string; content: string }[]>,
    writeSchema: (kbPath: string, subpath: string, content: string) =>
      api.invoke('schema:write', kbPath, subpath, content) as Promise<{ success: boolean }>,
    checkSchemaUpdate: (kbPath: string) =>
      api.invoke('schema:check-update', kbPath) as Promise<{ updateAvailable: boolean; currentVersion: number; latestVersion: number }>,
    updateSchema: (kbPath: string) =>
      api.invoke('schema:update', kbPath) as Promise<{ success: boolean; updated: string[]; error?: string }>,

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

    checkCompileStatus: (kbPath: string, rawFileName: string) =>
      api.invoke('compile:check', kbPath, rawFileName) as Promise<{ compiled: boolean; wikiPages?: string[]; compiledAt?: string }>,
    logCompile: (kbPath: string, rawFileName: string, wikiPages: string[]) =>
      api.invoke('compile:log', kbPath, rawFileName, wikiPages) as Promise<{ success: boolean }>,
    validateCompile: (content: string, pageName: string) =>
      api.invoke('compile:validate', content, pageName) as Promise<{ pageName: string; passed: number; failed: number; warnings: number; issues: { severity: string; rule: string; message: string }[]; score: number }>,
    validateCompileAll: (output: string) =>
      api.invoke('compile:validate-all', output) as Promise<{ reports: { pageName: string; score: number; failed: number; warnings: number; issues: { severity: string; rule: string; message: string }[] }[]; overallScore: number }>,
    iterateCompile: (kbPath: string, rawFilePath: string) =>
      api.invoke('compile:iterate', kbPath, rawFilePath) as Promise<{ rawFileName: string; iterations: number; finalScore: number; compileOutput: string; history: { iteration: number; score: number }[] }>,

    // Search
    buildSearchIndex: (kbPath: string) =>
      api.invoke('search:build', kbPath) as Promise<{ success: boolean; count?: number }>,
    search: (kbPath: string, query: string) =>
      api.invoke('search:query', kbPath, query) as Promise<{ name: string }[]>,

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

    // Index
    rebuildIndex: (kbPath: string) =>
      api.invoke('index:rebuild', kbPath) as Promise<{ pagesIndexed: number; chunksIndexed: number; sourcesIndexed: number; errors: string[] }>,
    getIndexStatus: (kbPath: string) =>
      api.invoke('index:status', kbPath) as Promise<{ pages: number; sources: number; lastRebuild: string }>,

    // Semantic compile
    compileV2: (kbPath: string, rawFilePath: string) =>
      api.invoke('llm:compile-v2', kbPath, rawFilePath) as Promise<{ compileOutput: string; plan: any; candidatePages: string[] }>,

    // Semantic QA (non-streaming — backward compatible)
    qaV2: (kbPath: string, question: string) =>
      api.invoke('llm:qa-v2', kbPath, question) as Promise<{ answer: string; sources: { title: string; chunk_index: number; similarity: number }[] }>,

    // Streaming QA (Phase 1)
    askStream: (requestId: string, kbPath: string, question: string, convId?: string, historyLimit?: number) =>
      api.invoke('qa:ask-stream', requestId, kbPath, question, convId, historyLimit),
    onToken: (callback: (data: { requestId: string; token: string; accumulated: string; thinking?: string }) => void) =>
      api.on('qa:token', callback) as () => void,
    onTokenEnd: (callback: (data: { requestId: string; sources?: { title: string; chunk_index: number; similarity: number }[]; accumulated?: string; thinking?: string; suggestArchive?: boolean; error?: string; partial?: boolean; convId?: string }) => void) =>
      api.on('qa:token-end', callback) as () => void,

    // Feedback (Phase 1)
    sendFeedback: (kbPath: string, convId: string, msgIndex: number, type: 'helpful' | 'inaccurate' | 'more_detail') =>
      api.invoke('qa:feedback', kbPath, convId, msgIndex, type) as Promise<{ success: boolean }>,

    // Conversation management (Phase 1)
    listConversations: (kbPath: string) =>
      api.invoke('conv:list', kbPath) as Promise<any[]>,
    createConversation: (kbPath: string, title?: string) =>
      api.invoke('conv:create', kbPath, title) as Promise<any>,
    getConversation: (kbPath: string, convId: string) =>
      api.invoke('conv:get', kbPath, convId) as Promise<any>,
    deleteConversation: (kbPath: string, convId: string) =>
      api.invoke('conv:delete', kbPath, convId) as Promise<{ success: boolean }>,

    // Knowledge gaps
    listGaps: (kbPath: string) =>
      api.invoke('gaps:list', kbPath) as Promise<any[]>,
    deleteGap: (kbPath: string, gapId: string) =>
      api.invoke('gaps:delete', kbPath, gapId) as Promise<{ success: boolean }>,

    // Advanced settings
    getAdvancedSettings: (kbPath: string) =>
      api.invoke('settings:get-advanced', kbPath) as Promise<Record<string, string>>,
    saveAdvancedSettings: (kbPath: string, settings: Record<string, string>) =>
      api.invoke('settings:save-advanced', kbPath, settings) as Promise<{ success: boolean }>,

    // Conflicts
    listConflicts: (kbPath: string) =>
      api.invoke('conflicts:list', kbPath) as Promise<any[]>,
    resolveConflict: (kbPath: string, conflictId: number, resolution: string) =>
      api.invoke('conflicts:resolve', kbPath, conflictId, resolution) as Promise<{ success: boolean }>,

    // Archive QA
    archiveQA: (kbPath: string, question: string, answer: string) =>
      api.invoke('wiki:archive-qa', kbPath, question, answer) as Promise<{ success: boolean; path?: string }>,

    // Diagnostics
    getSystemInfo: (kbPath: string) =>
      api.invoke('diagnostics:system-info', kbPath) as Promise<SystemInfo>,
    getMainLagSamples: () =>
      api.invoke('diagnostics:main-lag') as Promise<{ time: number; delay: number }[]>,

    // LLM Logs
    getLLMLogs: (kbPath: string, query?: { since?: string; role?: string; limit?: number }) =>
      api.invoke('llm-logs:list', kbPath, query) as Promise<any[]>,
    getLLMLogStats: (kbPath: string) =>
      api.invoke('llm-logs:stats', kbPath) as Promise<{ totalCalls: number; totalErrors: number; avgDurationMs: number; callsByRole: Record<string, number> }>,

    // QA Analytics
    getQAAnalytics: (kbPath: string, query?: { since?: string; limit?: number }) =>
      api.invoke('qa-analytics:list', kbPath, query) as Promise<any[]>,
    getQAAnalyticsStats: (kbPath: string) =>
      api.invoke('qa-analytics:stats', kbPath) as Promise<any>,

    // Generic invoke for handlers not yet typed
    invoke: (channel: string, ...args: unknown[]) =>
      api.invoke(channel, ...args),

    // Event listeners
    on: (channel: string, callback: (...args: any[]) => void) =>
      api.on(channel, callback) as () => void,

    // Preload progress
    onPreloadProgress: (callback: (p: PreloadProgress) => void) =>
      api.on('preload:progress', callback) as () => void,
  }
}

export interface PreloadProgress {
  step: number
  label: string
  detail: string
  total: number
}

export interface CompileProgress {
  step: number
  label: string
  detail?: string
  percent: number
}

export interface RebuildProgress {
  phase: string
  label: string
  current: number
  total: number
  percent: number
}

export interface SystemInfo {
  sqlite: {
    filePath: string
    fileSizeKB: number
    pageCount: number
    wikiDiskCount: number
    sourceCount: number
    rawDiskCount: number
    sourceByStatus: { pending: number; compiling: number; compiled: number; failed: number }
    linkCount: number
    conflictCount: number
    settingsCount: number
  }
  lancedb: {
    dirPath: string
    totalChunks: number
    pageChunks: number
    sourceChunks: number
    dirSizeKB: number
  }
  embedding: {
    model: string
    dimension: number
    ready: boolean
  }
  storage: {
    indexDirSizeKB: number
    compileLogEntries: number
    lastRebuild: string
    flexSearchBuilt: boolean
  }
}
