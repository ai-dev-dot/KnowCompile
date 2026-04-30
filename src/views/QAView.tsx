import { useState, useEffect, useRef } from 'react'
import ChatMessage from '../components/ChatMessage'
import { useIPC } from '../hooks/useIPC'

interface Props { kbPath: string }

export default function QAView({ kbPath }: Props) {
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string; sources?: string[] }[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [pageNames, setPageNames] = useState<string[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const ipc = useIPC()

  useEffect(() => {
    ipc.listWikiPages(kbPath).then(pages => setPageNames(pages.map(p => p.name)))
  }, [kbPath])

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
      // Simple keyword matching to find relevant pages
      const relevant = pageNames.filter(name =>
        question.toLowerCase().includes(name.toLowerCase()) ||
        name.toLowerCase().includes(question.toLowerCase().slice(0, 10))
      ).slice(0, 5)

      const answer = await ipc.qa(kbPath, question, relevant)
      setMessages(prev => [...prev, { role: 'assistant', content: answer }])
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `出错了：${err}` }])
    } finally {
      setLoading(false)
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
              <p className="text-text-muted text-sm">基于你的 Wiki 知识库回答问题</p>
            </div>
          </div>
        ) : (
          messages.map((msg, i) => <ChatMessage key={i} {...msg} />)
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
