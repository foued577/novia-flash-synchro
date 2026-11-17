/** Mini-courbe de tendance : tracé neutre, dernier point dans la couleur du service. */
export function Sparkline({ values, accent, width = 120, height = 36 }: { values: number[]; accent: string; width?: number; height?: number }) {
  if (values.length < 2) return <div style={{ width, height }} />
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const pad = 5
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (width - pad * 2)
    const y = pad + (1 - (v - min) / range) * (height - pad * 2)
    return [x, y] as const
  })
  const last = pts[pts.length - 1]
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="overflow-visible">
      <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke="#A3ACB9" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r={4.5} fill={accent} stroke="#fff" strokeWidth={2} />
    </svg>
  )
}
