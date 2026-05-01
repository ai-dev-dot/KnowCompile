import { useState, useEffect, useRef } from 'react'
import ChatMessage from '../components/ChatMessage'
import { useIPC } from '../hooks/useIPC'

interface Source {
  title: string
  chunk_index: number
  similarity: number
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  sources?: Source[]
  archived?: boolean
}

interface Props { kbPath: string }

export default function QAView({ kbPath }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const ipc = useIPC()

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight)
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || loading) return
    const question = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: question }])
    setLoading(true)

    try {
      const result = await ipc.qaV2(kbPath, question)
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: result.answer,
        sources: result.sources,
      }])
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `出错了：${err}` }])
    } finally {
      setLoading(false)
    }
  }

  const handleFeedback = (msgIdx: number, type: 'helpful' | 'inaccurate' | 'more_detail') => {
    console.log(`Feedback for message ${msgIdx}: ${type}`)
  }

  const handleArchive = async (msgIdx: number) => {
    const msg = messages[msgIdx]
    if (!msg || msg.role !== 'assistant' || msg.archived) return

    // Find preceding user message as question
    let question = ''
    for (let i = msgIdx - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        question = messages[i].content
        break
      }
    }

    try {
      await ipc.archiveQA(kbPath, question, msg.content)
      setMessages(prev => prev.map((m, i) =>
        i === msgIdx ? { ...m, archived: true } : m
      ))
    } catch (err) {
      console.error('Archive failed:', err)
    }
  }

  return (
    <div className="flex-1 flex flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <p className="text-4xl mb-4">💬</p>
              <p className="text-text text-lg mb-2">AI 问答</p>
              <p className="text-text-muted text-sm">基于你的 Wiki 知识库，使用语义搜索回答问题</p>
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <ChatMessage
              key={i}
              role={msg.role}
              content={msg.content}
              sources={msg.sources}
              archived={msg.archived}
              onFeedback={msg.role === 'assistant' ? (type) => handleFeedback(i, type) : undefined}
              onArchive={msg.role === 'assistant' ? () => handleArchive(i) : undefined}
            />
          ))
        )}
        {loading && (
          <div className="flex justify-start mb-4">
            <div className="bg-gray-800 rounded-xl px-4 py-3 text-text-muted">
              <span className="animate-pulse">思考中...</span>
            </div>
          </div>
        )}
      </div>
      <div className="p-4 border-t border-border">
        <div className="flex gap-3 max-w-3xl mx-auto">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="基于 Wiki 知识库提问..."
            className="flex-1 bg-gray-800 text-text rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-accent text-sm"
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="px-5 py-2.5 bg-accent text-gray-950 rounded-lg font-medium text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            发送
          </button>
        </div>
      </div>
    </div>
  )
}
