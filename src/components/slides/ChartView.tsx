import type { ReactElement } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { donutColor, seriesColor } from '@/domain/blocks'
import type { ChartBlock } from '@/domain/types'
import { formatNumber } from '@/lib/format'

// ---------------------------------------------------------------------------
// Graphiques (Recharts) : marques fines, grille discrète, légende dès 2 séries,
// étiquettes sélectives, texte toujours en encre neutre (jamais en couleur de série).
// ---------------------------------------------------------------------------

interface ChartViewProps {
  block: ChartBlock
  accent: string
  size?: 'slide' | 'app'
  animate?: boolean
}

const INK = '#2B3445'
const MUTED = '#5C6880'
const GRID = '#E6EAF1'
const AXIS = '#C3CBD8'

function withUnit(value: number | null | undefined, unit: string) {
  if (value === null || value === undefined || Number.isNaN(value)) return ''
  const n = formatNumber(Number(value))
  if (!unit) return n
  return unit === '%' ? `${n} %` : `${n} ${unit}`
}

interface TooltipEntry {
  name?: string | number
  value?: number | string | (number | string)[]
  color?: string
  payload?: { fill?: string }
}

function ChartTooltip({ active, payload, label, unit, f }: { active?: boolean; payload?: TooltipEntry[]; label?: string | number; unit: string; f: number }) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="rounded-lg border border-line bg-white shadow-[var(--shadow-float)]" style={{ padding: `${10 * f}px ${14 * f}px`, fontSize: 18 * f }}>
      {label !== undefined && <div className="font-semibold text-ink" style={{ marginBottom: 4 * f }}>{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center text-ink-2" style={{ gap: 8 * f }}>
          <span className="inline-block rounded-sm" style={{ width: 12 * f, height: 12 * f, background: p.color ?? p.payload?.fill }} />
          <span>{p.name}</span>
          <span className="ml-auto pl-3 font-semibold text-ink tnum">{withUnit(Number(p.value), unit)}</span>
        </div>
      ))}
    </div>
  )
}

export function ChartLegend({ items, f }: { items: { name: string; color: string }[]; f: number }) {
  return (
    <div className="flex flex-wrap items-center text-ink-2" style={{ gap: `${6 * f}px ${22 * f}px`, fontSize: 20 * f, marginBottom: 10 * f }}>
      {items.map((it) => (
        <span key={it.name} className="inline-flex items-center" style={{ gap: 8 * f }}>
          <span className="inline-block rounded-[3px]" style={{ width: 14 * f, height: 14 * f, background: it.color }} />
          {it.name}
        </span>
      ))}
    </div>
  )
}

export function ChartView({ block, accent, size = 'slide', animate = false }: ChartViewProps) {
  const f = size === 'slide' ? 1 : 0.62
  const fs = Math.round(20 * f)
  const unit = block.unit
  const colors = block.series.map((_, j) => seriesColor(block, j, accent))
  const data = block.categories.map((name, i) => {
    const row: Record<string, string | number | null> = { name }
    let total = 0
    block.series.forEach((s, j) => {
      row[`s${j}`] = s.values[i] ?? null
      total += s.values[i] ?? 0
    })
    row.__total = total
    return row
  })
  const tick = { fill: MUTED, fontSize: fs, fontFamily: 'Source Sans 3, sans-serif' }
  const valueStyle = { fill: INK, fontSize: fs, fontWeight: 600, fontFamily: 'Source Sans 3, sans-serif' }
  const radius = Math.round(5 * f)
  const multi = block.series.length > 1
  const tooltip = animate || size === 'app' ? <Tooltip cursor={{ fill: 'rgba(54,97,179,0.06)' }} content={<ChartTooltip unit={unit} f={f} />} /> : null
  const legend = multi && block.chartType !== 'donut' ? <ChartLegend f={f} items={block.series.map((s, j) => ({ name: s.name || `Série ${j + 1}`, color: colors[j] }))} /> : null

  if (block.categories.length === 0 || block.series.length === 0) {
    return <div className="grid h-full place-items-center text-ink-3" style={{ fontSize: fs }}>Aucune donnée</div>
  }

  let chart: ReactElement

  if (block.chartType === 'donut') {
    const serie = block.series[0]
    const pie = block.categories.map((name, i) => ({ name, value: Math.max(0, serie.values[i] ?? 0) }))
    const total = pie.reduce((a, b) => a + b.value, 0)
    return (
      <div className="flex h-full items-center" style={{ gap: 32 * f }}>
        <div className="relative h-full min-w-0 flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={pie} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="92%" paddingAngle={1} stroke="#fff" strokeWidth={3 * f} isAnimationActive={animate} startAngle={90} endAngle={-270}>
                {pie.map((_, i) => (
                  <Cell key={i} fill={donutColor(i)} />
                ))}
              </Pie>
              {tooltip}
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
            <div>
              <div className="font-display font-bold text-ink" style={{ fontSize: 44 * f, lineHeight: 1 }}>{withUnit(total, unit)}</div>
              <div className="text-ink-3" style={{ fontSize: 18 * f, marginTop: 6 * f }}>{serie.name || 'Total'}</div>
            </div>
          </div>
        </div>
        <ul className="shrink-0" style={{ fontSize: 20 * f, minWidth: 220 * f }}>
          {pie.map((p, i) => (
            <li key={p.name} className="flex items-center text-ink-2" style={{ gap: 10 * f, padding: `${5 * f}px 0` }}>
              <span className="inline-block shrink-0 rounded-[3px]" style={{ width: 14 * f, height: 14 * f, background: donutColor(i) }} />
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              <span className="font-semibold text-ink tnum">{withUnit(p.value, unit)}</span>
              <span className="w-[3.2em] text-right text-ink-3 tnum">{total ? Math.round((p.value / total) * 100) : 0} %</span>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  if (block.chartType === 'line') {
    const last = block.categories.length - 1
    chart = (
      <LineChart data={data} margin={{ top: 28 * f, right: 56 * f, left: 4, bottom: 4 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="name" tick={tick} stroke={AXIS} tickLine={false} interval={0} tickMargin={10 * f} />
        <YAxis tick={tick} axisLine={false} tickLine={false} width={60 * f} tickFormatter={(v: number) => formatNumber(v)} />
        {tooltip}
        {block.series.map((s, j) => (
          <Line
            key={s.id}
            type="monotone"
            dataKey={`s${j}`}
            name={s.name}
            stroke={colors[j]}
            strokeWidth={4 * f}
            strokeLinecap="round"
            dot={{ r: 7 * f, fill: colors[j], stroke: '#fff', strokeWidth: 3 * f }}
            activeDot={{ r: 9 * f, stroke: '#fff', strokeWidth: 3 * f }}
            isAnimationActive={animate}
            connectNulls
          >
            <LabelList
              dataKey={`s${j}`}
              content={(props) => {
                const { x, y, index, value } = props as { x?: number; y?: number; index?: number; value?: number }
                if ((!block.showValues && index !== last) || x === undefined || y === undefined) return null
                return (
                  <text x={Number(x) + (index === last ? 14 * f : 0)} y={Number(y) - 14 * f} textAnchor={index === last ? 'start' : 'middle'} style={valueStyle}>
                    {withUnit(value, unit)}
                  </text>
                )
              }}
            />
          </Line>
        ))}
      </LineChart>
    )
  } else if (block.chartType === 'horizontal') {
    const longest = Math.max(...block.categories.map((c) => c.length))
    const yWidth = Math.min(360 * f, Math.max(90 * f, longest * 11.5 * f))
    const lastIndex = block.series.length - 1
    chart = (
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 64 * f, left: 4, bottom: 0 }} barCategoryGap="22%">
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis type="number" tick={tick} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatNumber(v)} />
        <YAxis type="category" dataKey="name" tick={tick} stroke={AXIS} tickLine={false} width={yWidth} interval={0} />
        {tooltip}
        {block.series.map((s, j) => (
          <Bar
            key={s.id}
            dataKey={`s${j}`}
            name={s.name}
            stackId={multi ? 'stack' : undefined}
            fill={colors[j]}
            stroke={multi ? '#fff' : undefined}
            strokeWidth={multi ? 2 : 0}
            radius={j === lastIndex ? [0, radius, radius, 0] : 0}
            minPointSize={j === lastIndex ? 0.01 : 0}
            maxBarSize={38 * f}
            isAnimationActive={animate}
          >
            {(block.showValues || multi) && j === lastIndex && (
              <LabelList
                dataKey={multi ? '__total' : `s${j}`}
                content={(props) => {
                  const { x, y, width, height, value } = props as { x?: number; y?: number; width?: number; height?: number; value?: number }
                  if (x === undefined || y === undefined) return null
                  return (
                    <text x={Number(x) + Number(width ?? 0) + 10 * f} y={Number(y) + Number(height ?? 0) / 2} dominantBaseline="central" style={valueStyle}>
                      {withUnit(value, unit)}
                    </text>
                  )
                }}
              />
            )}
          </Bar>
        ))}
      </BarChart>
    )
  } else {
    const stacked = block.chartType === 'stacked'
    const lastIndex = block.series.length - 1
    chart = (
      <BarChart data={data} margin={{ top: 40 * f, right: 12 * f, left: 4, bottom: 4 }} barCategoryGap={multi && !stacked ? '18%' : '28%'} barGap={3}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="name" tick={tick} stroke={AXIS} tickLine={false} interval={0} tickMargin={10 * f} />
        <YAxis tick={tick} axisLine={false} tickLine={false} width={60 * f} tickFormatter={(v: number) => formatNumber(v)} />
        {tooltip}
        {block.series.map((s, j) => (
          <Bar
            key={s.id}
            dataKey={`s${j}`}
            name={s.name}
            stackId={stacked ? 'stack' : undefined}
            fill={colors[j]}
            stroke={stacked ? '#fff' : undefined}
            strokeWidth={stacked ? 2 : 0}
            radius={!stacked || j === lastIndex ? [radius, radius, 0, 0] : 0}
            minPointSize={block.showValues && (!stacked || j === lastIndex) ? 0.01 : 0}
            maxBarSize={(multi && !stacked ? 34 : 56) * f}
            isAnimationActive={animate}
          >
            {block.showValues && (!stacked || j === lastIndex) && (
              <LabelList
                dataKey={stacked ? '__total' : `s${j}`}
                content={(props) => {
                  const { x, y, width, value } = props as { x?: number; y?: number; width?: number; value?: number }
                  if (x === undefined || y === undefined) return null
                  return (
                    <text x={Number(x) + Number(width ?? 0) / 2} y={Number(y) - 10 * f} textAnchor="middle" style={valueStyle}>
                      {withUnit(value, unit)}
                    </text>
                  )
                }}
              />
            )}
          </Bar>
        ))}
      </BarChart>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {legend}
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          {chart}
        </ResponsiveContainer>
      </div>
    </div>
  )
}
