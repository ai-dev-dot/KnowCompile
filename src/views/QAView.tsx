import { useState, useEffect, useRef, useCallback } from 'react'
import ChatMessage from '../components/ChatMessage'
import ConversationList from '../components/ConversationList'
import { useIPC } from '../hooks/useIPC'

interface Source {
  title: string
  chunk_index: number
  similarity: number
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  thinking?: string
  sources?: Source[]
  archived?: boolean
  feedback?: 'helpful' | 'inaccurate' | 'more_detail'
  partial?: boolean
}

interface ConvSummary {
  id: string
  title: string
  updatedAt: string
}

interface Props { kbPath: string }

export default function QAView({ kbPath }: Props) {
  const [conversations, setConversations] = useState<ConvSummary[]>([])
  const [activeConvId, setActiveConvId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamingToken, setStreamingToken] = useState('')
  const [streamingThinking, setStreamingThinking] = useState('')
  const [streamingError, setStreamingError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const ipc = useIPC()

  // Ref-based token buffer for rAF batching
  const tokenBufferRef = useRef('')
  const rafIdRef = useRef<number>(0)
  const abortRef = useRef<AbortController | null>(null)
  const requestIdRef = useRef('')

  // Load conversations on mount
  useEffect(() => {
    ipc.listConversations(kbPath).then(list => {
      setConversations(list)
      if (list.length > 0) selectConversation(list[0].id)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kbPath])

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight)
  }, [messages, streamingToken])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current)
    }
  }, [])

  const selectConversation = async (id: string) => {
    // Abort current stream if switching
    abortRef.current?.abort()

    setActiveConvId(id)
    setStreaming(false)
    setStreamingToken('')
    /* streamingSources removed */
    setStreamingError(null)

    const conv = await ipc.getConversation(kbPath, id)
    if (conv) {
      setMessages(conv.messages.map((m: any) => ({
        role: m.role,
        content: m.content,
        sources: m.sources,
        feedback: m.feedback,
        archived: m.archived,
      })))
    }
  }

  const handleSend = useCallback(async () => {
    if (!input.trim() || streaming) return

    const question = input.trim()
    setInput('')
    setStreamingError(null)

    // Auto-create conversation if none active
    let convId = activeConvId
    if (!convId) {
      const conv = await ipc.createConversation(kbPath)
      convId = conv.id
      setActiveConvId(convId)
      setConversations(prev => [{ id: conv.id, title: '新对话', updatedAt: conv.updatedAt }, ...prev])
    }

    // Add user message
    const userMsg: Message = { role: 'user', content: question }
    setMessages(prev => [...prev, userMsg])

    // Setup streaming state
    setStreaming(true)
    setStreamingToken('')
    /* streamingSources removed */

    const abortController = new AbortController()
    abortRef.current = abortController
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    requestIdRef.current = requestId

    // Register token listener
    const cleanupToken = ipc.onToken((data) => {
      if (data.requestId !== requestId) return // correlation ID guard
      tokenBufferRef.current += data.token
      if (data.thinking) setStreamingThinking(data.thinking)
      if (!rafIdRef.current) {
        rafIdRef.current = requestAnimationFrame(() => {
          setStreamingToken(tokenBufferRef.current)
          rafIdRef.current = 0
        })
      }
    })

    // Register end listener
    const cleanupEnd = ipc.onTokenEnd((data) => {
      if (data.requestId !== requestId) return
      cleanupToken()
      cleanupEnd()

      setStreaming(false)
      setStreamingToken('')
      abortRef.current = null

      if (data.error) {
        // Partial answer — show what we have + error banner
        const partialContent = data.accumulated || tokenBufferRef.current
        if (partialContent) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: partialContent,
            thinking: data.thinking,
            sources: data.sources,
            partial: true,
          }])
        }
        setStreamingError(data.error)
      } else {
        // Success — add final message
        const content = data.accumulated || tokenBufferRef.current
        setMessages(prev => [...prev, {
          role: 'assistant',
          content,
          thinking: data.thinking,
          sources: data.sources || [],
        }])
        // Refresh conversation list (title may have updated)
        ipc.listConversations(kbPath).then(setConversations)
      }
      /* streamingSources removed */
      tokenBufferRef.current = ''
    })

    // Start the stream
    try {
      await ipc.askStream(requestId, kbPath, question, convId || undefined, 10)
    } catch (err: any) {
      if (err?.message !== 'Request cancelled') {
        setStreamingError(err?.message || 'Stream failed')
        setStreaming(false)
      }
    }
  }, [input, streaming, activeConvId, kbPath, ipc])

  const handleStop = () => {
    abortRef.current?.abort()
    // The end listener will fire with partial=true via the backend
  }

  const handleFeedback = async (msgIndex: number, type: 'helpful' | 'inaccurate' | 'more_detail') => {
    if (!activeConvId) return
    // Update local state immediately for responsiveness
    setMessages(prev => prev.map((m, i) =>
      i === msgIndex ? { ...m, feedback: type } : m
    ))
    await ipc.sendFeedback(kbPath, activeConvId, msgIndex, type)
  }

  const handleArchive = async (msgIndex: number) => {
    const msg = messages[msgIndex]
    if (!msg || msg.role !== 'assistant' || msg.archived) return

    let question = ''
    for (let i = msgIndex - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        question = messages[i].content
        break
      }
    }

    try {
      await ipc.archiveQA(kbPath, question, msg.content)
      setMessages(prev => prev.map((m, i) =>
        i === msgIndex ? { ...m, archived: true } : m
      ))
    } catch (err) {
      console.error('Archive failed:', err)
    }
  }

  const handleCreateConv = async () => {
    abortRef.current?.abort()
    setStreaming(false)
    setStreamingToken('')
    /* streamingSources removed */
    setStreamingError(null)

    const conv = await ipc.createConversation(kbPath)
    setConversations(prev => [{ id: conv.id, title: '新对话', updatedAt: conv.updatedAt }, ...prev])
    setActiveConvId(conv.id)
    setMessages([])
  }

  const handleDeleteConv = async (id: string) => {
    await ipc.deleteConversation(kbPath, id)
    setConversations(prev => prev.filter(c => c.id !== id))
    if (activeConvId === id) {
      setActiveConvId(null)
      setMessages([])
      abortRef.current?.abort()
      setStreaming(false)
      setStreamingToken('')
    }
  }

  return (
    <div className="flex-1 flex">
      <ConversationList
        conversations={conversations}
        activeId={activeConvId}
        onSelect={selectConversation}
        onCreate={handleCreateConv}
        onDelete={handleDeleteConv}
      />

      <div className="flex-1 flex flex-col">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6">
          {messages.length === 0 && !streaming ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <p className="text-4xl mb-4">💬</p>
                <p className="text-text text-lg mb-2">AI 问答</p>
                <p className="text-text-muted text-sm">选择左侧对话或创建新对话开始提问</p>
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg, i) => (
                <ChatMessage
                  key={i}
                  role={msg.role}
                  content={msg.content}
                  thinking={msg.thinking}
                  sources={msg.sources}
                  msgIndex={i}
                  archived={msg.archived}
                  feedbackState={msg.feedback || null}
                  partial={msg.partial}
                  onFeedback={msg.role === 'assistant' ? (type) => handleFeedback(i, type) : undefined}
                  onArchive={msg.role === 'assistant' ? () => handleArchive(i) : undefined}
                />
              ))}
            </>
          )}

          {/* Streaming token display */}
          {streaming && streamingToken && (
            <div className="flex justify-start mb-4">
              <div className="max-w-[80%] rounded-xl px-4 py-3 bg-gray-800 text-text">
                {streamingThinking && (
                  <details className="mb-2 text-xs" open>
                    <summary className="text-text-muted cursor-pointer hover:text-text">推理过程</summary>
                    <pre className="mt-1 whitespace-pre-wrap text-text-muted/70 border-l-2 border-gray-600 pl-2">{streamingThinking}</pre>
                  </details>
                )}
                <div className="text-sm max-w-none prose prose-invert">
                  {streamingToken}
                  <span className="inline-block w-1.5 h-4 bg-accent ml-0.5 animate-pulse align-text-bottom" />
                </div>
              </div>
            </div>
          )}

          {/* Streaming loading (before first token) */}
          {streaming && !streamingToken && (
            <div className="flex justify-start mb-4">
              <div className="bg-gray-800 rounded-xl px-4 py-3 text-text-muted">
                <span className="animate-pulse">思考中...</span>
              </div>
            </div>
          )}

          {/* Error banner */}
          {streamingError && (
            <div className="flex justify-start mb-4">
              <div className="bg-red-900/30 border border-red-800 rounded-lg px-4 py-2 text-sm text-red-300 flex items-center gap-3">
                <span>网络中断，回答不完整</span>
                <button
                  onClick={() => {
                    setStreamingError(null)
                    // Re-send the last user question if available
                    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
                    if (lastUserMsg) {
                      setInput(lastUserMsg.content)
                    }
                  }}
                  className="text-red-400 hover:text-red-300 underline text-xs"
                >
                  重试
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Input bar */}
        <div className="p-4 border-t border-border">
          <div className="flex gap-3 max-w-3xl mx-auto">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !streaming) handleSend()
                if (e.key === 'Escape' && streaming) handleStop()
              }}
              placeholder="基于 Wiki 知识库提问..."
              className="flex-1 bg-gray-800 text-text rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-accent text-sm"
              disabled={streaming && !!streamingToken}
            />
            {streaming ? (
              <button
                onClick={handleStop}
                className="px-5 py-2.5 bg-red-700 text-white rounded-lg font-medium text-sm hover:bg-red-600 transition-colors"
              >
                停止
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="px-5 py-2.5 bg-accent text-gray-950 rounded-lg font-medium text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                发送
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
