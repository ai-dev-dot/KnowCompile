import { useEffect, useRef } from 'react'
import cytoscape, { Core } from 'cytoscape'
import { useIPC } from '../hooks/useIPC'

interface Props { kbPath: string }

export default function GraphView({ kbPath }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<Core | null>(null)
  const ipc = useIPC()

  useEffect(() => {
    (async () => {
      const data = await ipc.getGraphData(kbPath)

      if (!containerRef.current) return
      if (cyRef.current) cyRef.current.destroy()

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

      cyRef.current = cy
    })()

    return () => {
      cyRef.current?.destroy()
      cyRef.current = null
    }
  }, [kbPath])

  return (
    <div className="flex-1 flex flex-col">
      <div className="px-4 py-3 border-b border-border text-sm font-semibold text-text">
        知识图谱
      </div>
      <div ref={containerRef} className="flex-1" />
    </div>
  )
}
