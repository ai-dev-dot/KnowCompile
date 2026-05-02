import { useEffect, useRef, useState, useCallback } from 'react'
import cytoscape, { Core } from 'cytoscape'
import { useIPC } from '../hooks/useIPC'

interface Props { kbPath: string; active?: boolean }

export default function GraphView({ kbPath, active }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<Core | null>(null)
  const ipc = useIPC()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nodeCount, setNodeCount] = useState(0)

  const loadGraph = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await ipc.getGraphData(kbPath)
      setNodeCount(data.nodes.length)

      if (!containerRef.current) return
      if (cyRef.current) cyRef.current.destroy()
      cyRef.current = null

      if (data.nodes.length === 0) return

      const cy = cytoscape({
        container: containerRef.current,
        elements: [
          ...data.nodes.map(n => ({
            data: { id: n.id, label: n.label, weight: n.linkCount },
          })),
          ...data.edges.map(e => ({
            data: { id: `${e.source}-${e.target}`, source: e.source, target: e.target },
          })),
        ],
        style: [
          {
            selector: 'node',
            style: {
              'label': 'data(label)',
              'background-color': '#cba6f7',
              'color': '#cdd6f4',
              'font-size': '10px',
              'text-valign': 'bottom',
              'text-halign': 'center',
              'width': 'mapData(weight, 0, 20, 12, 36)',
              'height': 'mapData(weight, 0, 20, 12, 36)',
            },
          },
          {
            selector: 'edge',
            style: {
              'width': 1,
              'line-color': '#45475a',
              'curve-style': 'bezier',
            },
          },
        ],
        layout: { name: 'cose', animate: false },
        userZoomingEnabled: true,
        userPanningEnabled: true,
      })

      cy.on('tap', 'node', (evt) => {
        const nodeId = evt.target.id()
        // Future: navigate to wiki page
        console.log('Node tapped:', nodeId)
      })

      cyRef.current = cy
    } catch (err) {
      console.error('Graph load failed:', err)
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [kbPath])

  useEffect(() => {
    if (!active) return
    loadGraph()
    return () => {
      cyRef.current?.destroy()
      cyRef.current = null
    }
  }, [loadGraph, active])

  return (
    <div className="flex-1 flex flex-col">
      <div className="px-4 py-3 border-b border-border text-sm font-semibold text-text flex items-center gap-2">
        知识图谱
        {!loading && nodeCount > 0 && (
          <span className="text-text-muted font-normal text-xs">{nodeCount} 个页面</span>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex-1 flex items-center justify-center text-text-muted">
          <span className="animate-pulse">加载图谱数据...</span>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-red-400 text-sm mb-2">加载失败</p>
            <p className="text-text-muted text-xs mb-3">{error}</p>
            <button
              onClick={loadGraph}
              className="px-4 py-1.5 bg-gray-700 text-text rounded text-sm hover:bg-gray-600"
            >
              重试
            </button>
          </div>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && nodeCount === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-3xl mb-2">🔗</div>
            <p className="text-text-muted text-sm mb-1">暂无知识图谱数据</p>
            <p className="text-gray-600 text-xs">
              编译资料生成 Wiki 页面后，页面之间的 [[链接]] 会形成知识图谱
            </p>
          </div>
        </div>
      )}

      {/* Graph canvas */}
      <div ref={containerRef} className="flex-1" style={{ display: loading || error || nodeCount === 0 ? 'none' : 'block' }} />
    </div>
  )
}
