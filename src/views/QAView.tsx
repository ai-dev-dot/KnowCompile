interface Props { kbPath: string }
export default function QAView({ kbPath: _kbPath }: Props) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <p className="text-text-muted">AI 问答（即将实现）</p>
    </div>
  )
}
