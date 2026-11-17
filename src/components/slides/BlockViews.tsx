import { clsx } from 'clsx'
import { AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, CheckCircle2, Circle, Clock3, HandHelping, Info, OctagonAlert, Target, type LucideIcon } from 'lucide-react'
import { computeTotalRow, isNumericColumn } from '@/domain/blocks'
import { SEVERITY } from '@/domain/status'
import type { Block, EventsBlock, ImageBlock, IssuesBlock, KpiBlock, KpiItem, ListBlock, ServicePalette, TableBlock, TextBlock } from '@/domain/types'
import { formatNumber, parseNumber } from '@/lib/format'
import { parseDate } from '@/domain/isoWeek'
import { ChartView } from './ChartView'
import { useAnimate } from './context'

// ---------------------------------------------------------------------------
// Rendu des blocs sur une diapositive 1920×1080 (tailles en pixels logiques).
// ---------------------------------------------------------------------------

export function BlockTitle({ children }: { children: string }) {
  if (!children.trim()) return null
  return <h3 className="mb-4 font-display text-[26px] leading-tight font-bold text-ink">{children}</h3>
}

// ----- Indicateurs -------------------------------------------------------------

export function kpiDelta(item: KpiItem) {
  const value = parseNumber(item.value)
  const previous = parseNumber(item.previous)
  if (value === null || previous === null) return null
  const delta = value - previous
  const tone = delta === 0 || item.goodWhen === 'neutral' ? 'neutral' : (delta > 0) === (item.goodWhen === 'up') ? 'good' : 'bad'
  const unit = item.unit === '%' ? ' pt' + (Math.abs(delta) > 1 ? 's' : '') : item.unit ? ` ${item.unit}` : ''
  const label = `${delta > 0 ? '+' : delta < 0 ? '−' : '±'}${formatNumber(Math.abs(delta))}${unit}`
  return { delta, tone, label }
}

const TONE_STYLE = {
  good: { color: '#15803D', bg: '#E9F7EE' },
  bad: { color: '#B42318', bg: '#FDEEEC' },
  neutral: { color: '#5C6880', bg: '#EEF1F6' },
}

function KpiView({ block, palette, dense }: { block: KpiBlock; palette: ServicePalette; dense: boolean }) {
  const items = block.items.filter((i) => i.label.trim() || i.value.trim())
  const cols = items.length <= 5 ? items.length : 4
  return (
    <div>
      <BlockTitle>{block.title}</BlockTitle>
      <div className="grid gap-6" style={{ gridTemplateColumns: `repeat(${Math.max(1, cols)}, minmax(0, 1fr))` }}>
        {items.map((item) => {
          const d = kpiDelta(item)
          const Arrow = !d || d.delta === 0 ? ArrowRight : d.delta > 0 ? ArrowUpRight : ArrowDownRight
          const style = TONE_STYLE[d?.tone as keyof typeof TONE_STYLE] ?? TONE_STYLE.neutral
          return (
            <div key={item.id} className={clsx('flex min-w-0 flex-col rounded-[20px]', dense ? 'px-6 py-4' : 'px-7 pt-6 pb-6')} style={{ background: palette.tint }}>
              <div className={clsx('text-[23px] leading-[1.25] font-semibold text-ink-2', dense ? 'line-clamp-1' : 'line-clamp-2 min-h-[2.5em]')}>{item.label}</div>
              <div className={clsx('flex items-baseline gap-2', dense ? 'mt-1.5' : 'mt-2')}>
                <span className={clsx('font-display leading-none font-bold tracking-tight text-ink', dense ? 'text-[56px]' : 'text-[68px]')}>{item.value || '—'}</span>
                {item.unit && <span className="text-[28px] font-semibold text-ink-2">{item.unit}</span>}
              </div>
              <div className={clsx('flex flex-wrap items-center gap-x-3 gap-y-1 text-[20px]', dense ? 'mt-2.5' : 'mt-4')}>
                {d ? (
                  <>
                    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-bold" style={{ color: style.color, background: style.bg }}>
                      <Arrow size={22} strokeWidth={2.6} aria-hidden />
                      {d.label}
                    </span>
                    <span className="text-ink-3">précédemment {item.previous}</span>
                  </>
                ) : item.previous ? (
                  <span className="text-ink-3">précédemment {item.previous}</span>
                ) : null}
                {item.target && (
                  <span className="inline-flex items-center gap-1 text-ink-3">
                    <Target size={20} aria-hidden /> objectif {item.target}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ----- Liste -----------------------------------------------------------------------

const LIST_STATUS: Record<string, { icon: LucideIcon; color: string; label: string }> = {
  done: { icon: CheckCircle2, color: '#15803D', label: 'Fait' },
  ongoing: { icon: Clock3, color: '#B45309', label: 'En cours' },
  todo: { icon: Circle, color: '#77839A', label: 'À faire' },
}

function ListView({ block, palette }: { block: ListBlock; palette: ServicePalette }) {
  const items = block.items.filter((i) => i.text.trim())
  const dense = items.length > 6
  return (
    <div>
      <BlockTitle>{block.title}</BlockTitle>
      <ul className={clsx('flex flex-col', dense ? 'gap-3' : 'gap-[18px]')}>
        {items.map((item, index) => {
          const status = item.status !== 'none' ? LIST_STATUS[item.status] : null
          return (
            <li key={item.id} className={clsx('flex items-start gap-4 leading-[1.35] text-ink', dense ? 'text-[24px]' : 'text-[28px]')}>
              {status ? (
                <status.icon size={dense ? 28 : 32} strokeWidth={2.2} className="mt-[3px] shrink-0" style={{ color: status.color }} aria-label={status.label} />
              ) : block.style === 'numbered' ? (
                <span className="mt-[2px] grid size-9 shrink-0 place-items-center rounded-full font-display text-[19px] font-bold text-white" style={{ background: palette.accent }}>
                  {index + 1}
                </span>
              ) : (
                <span className="mt-[0.5em] size-3 shrink-0 rounded-[3px]" style={{ background: palette.accent }} aria-hidden />
              )}
              <span className={clsx('min-w-0', item.status === 'done' && 'text-ink')}>{item.text}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ----- Tableau ---------------------------------------------------------------------

function TableView({ block, palette }: { block: TableBlock; palette: ServicePalette }) {
  const rows = block.rows.filter((r) => r.some((c) => c.trim()))
  const total = block.totalRow ? computeTotalRow({ columns: block.columns, rows }) : null
  const count = rows.length + (total ? 1 : 0)
  const fontSize = count > 14 ? 17 : count > 10 ? 19 : count > 7 ? 21 : 23
  const pad = count > 10 ? '7px 14px' : '10px 16px'
  const numeric = block.columns.map((_, i) => i > 0 && isNumericColumn(rows, i))
  return (
    <div>
      <BlockTitle>{block.title}</BlockTitle>
      <div className="overflow-hidden rounded-[14px] ring-1 ring-line">
        <table className="w-full border-collapse leading-[1.3]" style={{ fontSize }}>
          <thead>
            <tr style={{ background: palette.strong }}>
              {block.columns.map((c, i) => (
                <th key={i} className={clsx('font-semibold text-white', numeric[i] ? 'text-right' : 'text-left')} style={{ padding: pad }}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} style={{ background: r % 2 === 1 ? `${palette.tint}` : '#fff' }}>
                {block.columns.map((_, c) => (
                  <td key={c} className={clsx('border-t border-line text-ink', numeric[c] ? 'text-right tnum' : 'text-left', c === 0 && 'font-semibold')} style={{ padding: pad }}>
                    {row[c] ?? ''}
                  </td>
                ))}
              </tr>
            ))}
            {total && (
              <tr style={{ background: palette.tint }}>
                {total.map((cell, c) => (
                  <td key={c} className={clsx('font-bold text-ink', numeric[c] ? 'text-right tnum' : 'text-left')} style={{ padding: pad, borderTop: `2px solid ${palette.strong}` }}>
                    {cell}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {block.caption && <p className="mt-3 text-[19px] text-ink-3">{block.caption}</p>}
    </div>
  )
}

// ----- Texte ------------------------------------------------------------------------

const TEXT_TONES: Record<TextBlock['tone'], { icon: LucideIcon | null; color: string; bg: string }> = {
  neutral: { icon: null, color: '#1C2638', bg: 'transparent' },
  info: { icon: Info, color: '#2C4F95', bg: '#EEF3FB' },
  success: { icon: CheckCircle2, color: '#166534', bg: '#ECF8F0' },
  warning: { icon: AlertTriangle, color: '#8A4B06', bg: '#FEF6E7' },
  danger: { icon: OctagonAlert, color: '#A12A2A', bg: '#FDEEEE' },
}

function TextView({ block }: { block: TextBlock }) {
  const tone = TEXT_TONES[block.tone]
  if (block.tone === 'neutral') {
    return (
      <div>
        <BlockTitle>{block.title}</BlockTitle>
        <p className="text-[28px] leading-[1.45] whitespace-pre-line text-ink">{block.text}</p>
      </div>
    )
  }
  const Icon = tone.icon!
  return (
    <div>
      <BlockTitle>{block.title}</BlockTitle>
      <div className="flex items-start gap-4 rounded-[16px] px-7 py-5" style={{ background: tone.bg, color: tone.color }}>
        <Icon size={34} strokeWidth={2.2} className="mt-0.5 shrink-0" aria-hidden />
        <p className="text-[27px] leading-[1.4] font-semibold whitespace-pre-line">{block.text}</p>
      </div>
    </div>
  )
}

// ----- Image ------------------------------------------------------------------------

function ImageView({ block, maxHeight }: { block: ImageBlock; maxHeight: number }) {
  return (
    <figure>
      <BlockTitle>{block.title}</BlockTitle>
      <div className="overflow-hidden rounded-[16px] bg-canvas ring-1 ring-line" style={{ height: maxHeight }}>
        <img src={block.src} alt={block.caption || block.title || 'Image'} className="h-full w-full" style={{ objectFit: block.fit }} crossOrigin="anonymous" />
      </div>
      {block.caption && <figcaption className="mt-3 text-[19px] text-ink-3">{block.caption}</figcaption>}
    </figure>
  )
}

// ----- Événements --------------------------------------------------------------------

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const DAYS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.']

function EventsView({ block, palette }: { block: EventsBlock; palette: ServicePalette }) {
  const items = block.items.filter((i) => i.title.trim()).sort((a, b) => (a.date || '9').localeCompare(b.date || '9'))
  return (
    <div>
      <BlockTitle>{block.title}</BlockTitle>
      <ol className="flex flex-col gap-4">
        {items.map((item) => {
          const d = item.date ? parseDate(item.date) : null
          const end = item.endDate ? parseDate(item.endDate) : null
          return (
            <li key={item.id} className="flex items-stretch gap-5">
              <div className="flex w-[104px] shrink-0 flex-col items-center justify-center rounded-[14px] py-2" style={{ background: palette.tint }}>
                {d ? (
                  <>
                    <span className="text-[17px] font-semibold text-ink-3">{DAYS[d.getUTCDay()]}</span>
                    <span className="font-display text-[38px] leading-none font-bold" style={{ color: palette.strong }}>
                      {d.getUTCDate()}
                      {end && <span className="text-[24px]">–{end.getUTCDate()}</span>}
                    </span>
                    <span className="text-[17px] font-semibold text-ink-2">{MONTHS[d.getUTCMonth()]}</span>
                  </>
                ) : (
                  <span className="text-[18px] font-semibold text-ink-3">À dater</span>
                )}
              </div>
              <div className="min-w-0 flex-1 border-b border-line pb-3">
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className="text-[27px] leading-snug font-semibold text-ink">{item.title}</span>
                  {item.time && <span className="text-[21px] font-semibold text-ink-3 tnum">{item.time.replace(':', ' h ')}</span>}
                </div>
                {item.detail && <p className="mt-1 text-[22px] leading-snug text-ink-2">{item.detail}</p>}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

// ----- Points d'attention ------------------------------------------------------------

const SEVERITY_ICONS = { info: Info, attention: AlertTriangle, blocking: OctagonAlert }

function IssuesView({ block }: { block: IssuesBlock }) {
  const items = block.items.filter((i) => i.title.trim())
  return (
    <div>
      <BlockTitle>{block.title}</BlockTitle>
      <ul className="flex flex-col gap-4">
        {items.map((item) => {
          const sev = SEVERITY[item.severity]
          const Icon = SEVERITY_ICONS[item.severity]
          return (
            <li key={item.id} className="flex gap-5 rounded-[16px] border border-line bg-white px-6 py-5" style={{ borderLeft: `8px solid ${sev.color}` }}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[18px] font-bold" style={{ background: sev.bg, color: sev.text }}>
                    <Icon size={20} strokeWidth={2.4} aria-hidden />
                    {sev.label}
                  </span>
                  <span className="text-[27px] leading-snug font-semibold text-ink">{item.title}</span>
                </div>
                {item.detail && <p className="mt-2 text-[22px] leading-snug text-ink-2">{item.detail}</p>}
                {item.need && (
                  <p className="mt-3 inline-flex items-start gap-2 rounded-xl bg-canvas px-4 py-2 text-[21px] text-ink">
                    <HandHelping size={24} className="mt-0.5 shrink-0 text-novia-600" aria-hidden />
                    <span>
                      <strong className="font-semibold">Besoin : </strong>
                      {item.need}
                    </span>
                  </p>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ----- Aiguillage ------------------------------------------------------------------------

export function BlockView({ block, palette, chartHeight, dense = false }: { block: Block; palette: ServicePalette; chartHeight: number; dense?: boolean }) {
  const animate = useAnimate()
  switch (block.type) {
    case 'kpis':
      return <KpiView block={block} palette={palette} dense={dense} />
    case 'list':
      return <ListView block={block} palette={palette} />
    case 'table':
      return <TableView block={block} palette={palette} />
    case 'chart':
      return (
        <div>
          <BlockTitle>{block.title}</BlockTitle>
          <div style={{ height: chartHeight }}>
            <ChartView block={block} accent={palette.accent} animate={animate} />
          </div>
        </div>
      )
    case 'text':
      return <TextView block={block} />
    case 'image':
      return <ImageView block={block} maxHeight={chartHeight} />
    case 'events':
      return <EventsView block={block} palette={palette} />
    case 'issues':
      return <IssuesView block={block} />
  }
}
