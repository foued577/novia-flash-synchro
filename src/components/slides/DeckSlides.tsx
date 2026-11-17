import { clsx } from 'clsx'
import { CheckCircle2 } from 'lucide-react'
import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { blockHasContent } from '@/domain/blocks'
import { resolveSlideSubtitle, resolveSlideTitle } from '@/domain/periods'
import { submissionDeadline } from '@/domain/selectors'
import type { Block, Service, Slide } from '@/domain/types'
import { addMinutesToTime, formatFullDate, formatHour, formatPeriod, formatTime } from '@/lib/format'
import { LOGO_COLOR_URL, LOGO_LIGHT_URL } from '../brand/Logo'
import { ServiceIcon } from '../ui/Misc'
import { BlockView } from './BlockViews'
import type { DeckRenderData } from './context'

// ---------------------------------------------------------------------------
// Les diapositives générées : couverture, ordre du jour, ouverture de section,
// contenu de service, clôture. Toutes dessinées sur une toile 1920×1080.
// ---------------------------------------------------------------------------

const PAD_X = 104

/** Traits obliques inspirés des lettres du logo NOVIA. */
function Diagonals({ tone }: { tone: 'brand' | 'white' }) {
  const a = tone === 'brand' ? { c1: '#3661B3', c2: '#229CD7', o1: 0.07, o2: 0.1 } : { c1: '#FFFFFF', c2: '#FFFFFF', o1: 0.08, o2: 0.05 }
  return (
    <svg className="pointer-events-none absolute inset-0" width="1920" height="1080" viewBox="0 0 1920 1080" aria-hidden>
      <polygon points="1430,0 1600,0 1250,1080 1080,1080" fill={a.c1} opacity={a.o1} />
      <polygon points="1660,0 1760,0 1410,1080 1310,1080" fill={a.c2} opacity={a.o2} />
      <polygon points="1820,0 1920,0 1920,120 1610,1080 1510,1080" fill={a.c1} opacity={a.o1} />
    </svg>
  )
}

function managerOf(data: DeckRenderData, service: Service) {
  return data.users.find((u) => u.id === service.managerId) ?? null
}

/** Horaires de passage de chaque service selon l'heure de début. */
function schedule(data: DeckRenderData) {
  let cursor = 0
  return data.services.map((s) => {
    const minutes = data.meeting.durations[s.id] ?? s.durationMinutes
    const start = addMinutesToTime(data.meeting.meetingTime, cursor)
    cursor += minutes
    return { service: s, minutes, start, end: addMinutesToTime(data.meeting.meetingTime, cursor) }
  })
}

function SlideRibbon({ data, light = false }: { data: DeckRenderData; light?: boolean }) {
  const rows = schedule(data)
  const total = rows.reduce((a, r) => a + r.minutes, 0) || 1
  return (
    <div>
      <div className="flex h-[62px] gap-[5px]">
        {rows.map((r) => (
          <div key={r.service.id} className="flex min-w-0 items-center gap-3 overflow-hidden rounded-[8px] px-4 text-white" style={{ flexGrow: r.minutes / total, flexBasis: 0, background: r.service.palette.accent }}>
            <span className="truncate text-[24px] font-semibold">{r.service.shortName}</span>
            <span className="shrink-0 text-[21px] font-medium">{r.minutes} min</span>
          </div>
        ))}
      </div>
      <div className={clsx('relative mt-3 h-[30px] text-[21px] font-semibold tnum', light ? 'text-white' : 'text-ink-3')}>
        {rows.map((r, i) => {
          const before = rows.slice(0, i).reduce((a, x) => a + x.minutes, 0)
          return (
            <span key={r.service.id} className="absolute" style={{ left: `${(before / total) * 100}%` }}>
              {formatHour(r.start)}
            </span>
          )
        })}
        <span className="absolute right-0">{formatHour(rows.at(-1)?.end ?? data.meeting.meetingTime)}</span>
      </div>
    </div>
  )
}

function Footer({ data, index }: { data: DeckRenderData; index: number }) {
  return (
    <footer className="flex h-[64px] shrink-0 items-center justify-between border-t border-line text-[20px] text-ink-3" style={{ paddingInline: PAD_X }}>
      <span>Flash Synchro – Semaine {data.meeting.isoWeek}</span>
      <span className="tnum">
        {index + 1} / {data.deck.entries.length}
      </span>
    </footer>
  )
}

// ----- Couverture ---------------------------------------------------------------------

export function CoverSlide({ data }: { data: DeckRenderData }) {
  const { periods, meeting, settings } = data
  const total = data.services.reduce((a, s) => a + (meeting.durations[s.id] ?? s.durationMinutes), 0)
  return (
    <div className="relative h-full w-full overflow-hidden bg-[#F7F9FC]">
      <Diagonals tone="brand" />
      <img src={LOGO_COLOR_URL} alt="NOVIA" className="absolute top-[88px] h-[74px]" style={{ left: PAD_X }} />
      <div className="absolute top-[270px]" style={{ left: PAD_X, right: 300 }}>
        <p className="text-[30px] font-semibold text-novia-600">{settings.tagline}</p>
        <h1 className="mt-5 font-display text-[164px] leading-[0.92] font-extrabold tracking-[-0.035em] whitespace-nowrap text-novia-600">Flash Synchro</h1>
        <div className="mt-11 h-[8px] w-[520px] rounded-full bg-cyan-novia" />
        <p className="mt-10 font-display text-[66px] leading-none font-bold text-novia-700">Semaine {meeting.isoWeek}</p>
        <p className="mt-4 text-[40px] font-semibold text-novia-500">{formatPeriod(periods.week.start, periods.week.end)}</p>
        <p className="mt-6 text-[28px] text-ink-2">
          Bilan {periods.review.weeks.length > 1 ? `des ${periods.review.label.toLowerCase()}` : `de la ${periods.review.label.toLowerCase()}`} et prévisions de la {periods.forecast.label.toLowerCase()}
        </p>
      </div>
      <div className="absolute bottom-[78px]" style={{ left: PAD_X, right: PAD_X }}>
        <p className="mb-5 text-[27px] text-ink-2">
          Réunion du {formatFullDate(meeting.meetingDate)} à {formatTime(meeting.meetingTime)} — {total} minutes
        </p>
        <SlideRibbon data={data} />
      </div>
    </div>
  )
}


// ----- Ordre du jour ----------------------------------------------------------------------

export function AgendaSlide({ data }: { data: DeckRenderData }) {
  const rows = schedule(data)
  const max = Math.max(...rows.map((r) => r.minutes), 1)
  const total = rows.reduce((a, r) => a + r.minutes, 0)
  const rowPad = rows.length > 6 ? 12 : rows.length > 5 ? 18 : 24
  return (
    <div className="relative flex h-full w-full flex-col bg-white">
      <div className="absolute inset-y-0 left-0 w-[14px] bg-novia-600" />
      <header className="flex items-start justify-between pt-[64px] pb-[28px]" style={{ paddingInline: PAD_X }}>
        <div>
          <h2 className="font-display text-[64px] leading-none font-extrabold tracking-[-0.015em] text-novia-600">Ordre du jour</h2>
          <p className="mt-4 text-[28px] text-ink-2">
            Flash Synchro – Semaine {data.meeting.isoWeek} – {data.periods.review.weeks.length > 1 ? `bilan des ${data.periods.review.label.toLowerCase()}, ` : ''}
            {formatPeriod(data.periods.week.start, data.periods.week.end)}
          </p>
        </div>
        <img src={LOGO_COLOR_URL} alt="NOVIA" className="h-[58px]" />
      </header>
      <div className="min-h-0 flex-1" style={{ paddingInline: PAD_X }}>
        {rows.map((r, i) => {
          const manager = managerOf(data, r.service)
          return (
            <div key={r.service.id} className={clsx('flex items-center gap-9 border-line', i > 0 && 'border-t')} style={{ paddingBlock: rowPad }}>
              <div className="w-[250px] shrink-0 text-[29px] font-semibold text-ink-2 tnum">
                {formatHour(r.start)} – {formatHour(r.end)}
              </div>
              <div className="grid size-[70px] shrink-0 place-items-center rounded-[18px] text-white" style={{ background: r.service.palette.accent }}>
                <ServiceIcon icon={r.service.icon} size={34} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-display text-[38px] leading-tight font-bold text-ink">{r.service.name}</div>
                {manager && <div className="mt-1 truncate text-[24px] text-ink-2">{manager.fullName}, {manager.jobTitle.toLowerCase()}</div>}
              </div>
              <div className="h-[14px] w-[380px] shrink-0 rounded-full bg-canvas">
                <div className="h-full rounded-full" style={{ width: `${(r.minutes / max) * 100}%`, background: r.service.palette.accent }} />
              </div>
              <div className="w-[150px] shrink-0 text-right font-display text-[42px] font-bold text-ink">
                {r.minutes}
                <span className="ml-1.5 text-[26px] font-semibold text-ink-2">min</span>
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex items-center justify-between border-t border-line py-[26px] text-[26px] text-ink-2" style={{ paddingInline: PAD_X }}>
        <span>
          Durée totale : <strong className="font-semibold text-ink">{total} minutes</strong>
        </span>
        <span>
          Fin prévue à <strong className="font-semibold text-ink">{formatHour(rows.at(-1)?.end ?? data.meeting.meetingTime)}</strong>
        </span>
      </div>
    </div>
  )
}

// ----- Ouverture de section ---------------------------------------------------------------

export function SectionSlide({ data, serviceId }: { data: DeckRenderData; serviceId: string }) {
  const rows = schedule(data)
  const position = rows.findIndex((r) => r.service.id === serviceId)
  const row = rows[position]
  if (!row) return null
  const service = row.service
  const manager = managerOf(data, service)
  const slides = data.slides.filter((s) => s.serviceId === serviceId && !s.hidden).sort((a, b) => a.position - b.position)
  return (
    <div className="relative h-full w-full overflow-hidden text-white" style={{ background: service.palette.accent }}>
      <Diagonals tone="white" />
      <img src={LOGO_LIGHT_URL} alt="NOVIA" className="absolute top-[84px] h-[66px]" style={{ right: PAD_X }} />
      <div className="absolute top-[150px]" style={{ left: PAD_X, right: 760 }}>
        <div className="grid size-[108px] place-items-center rounded-[30px] bg-white/18">
          <ServiceIcon icon={service.icon} size={58} />
        </div>
        <p className="mt-10 text-[30px] font-semibold">
          Service {position + 1} sur {rows.length}
        </p>
        <h2 className="mt-2 font-display text-[108px] leading-[1.02] font-extrabold tracking-[-0.025em] text-white">{service.name}</h2>
        {manager && (
          <p className="mt-6 text-[32px]">
            {manager.fullName}, {manager.jobTitle.toLowerCase()}
          </p>
        )}
      </div>
      <div className="absolute bottom-[104px]" style={{ left: PAD_X }}>
        <div className="font-display text-[96px] leading-none font-bold">
          {row.minutes}
          <span className="ml-3 text-[42px] font-semibold">minutes</span>
        </div>
        <div className="mt-4 text-[30px] font-semibold tnum">
          {formatHour(row.start)} – {formatHour(row.end)}
        </div>
      </div>
      {slides.length > 0 && (
        <ol className="absolute bottom-[104px] w-[640px] rounded-[26px] bg-white/14 px-10 py-8" style={{ right: PAD_X }}>
          {slides.map((s, i) => (
            <li key={s.id} className="flex items-baseline gap-5 py-2 text-[28px] font-semibold">
              <span className="w-[1.4em] shrink-0 font-display text-[26px] font-bold tnum">{i + 1}</span>
              <span className="min-w-0 truncate">{resolveSlideTitle(s, data.periods)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

// ----- Contenu d'un service ------------------------------------------------------------

/**
 * Réduit le contenu si besoin pour qu'il tienne dans la diapositive, en
 * élargissant la zone de mise en page pour conserver toute la largeur utile.
 */
function AutoFit({ children }: { children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const o = outer.current
    const el = inner.current
    if (!o || !el) return
    let frame = 0
    const fit = () => {
      const avail = o.clientHeight
      if (!avail) return
      el.style.transform = ''
      el.style.width = '100%'
      let height = el.scrollHeight
      if (height <= avail + 1) return
      let scale = Math.max(0.5, avail / height)
      for (let k = 0; k < 6; k++) {
        el.style.width = `${100 / scale}%`
        height = el.scrollHeight
        const next = Math.max(0.5, Math.min(1, avail / height))
        if (Math.abs(next - scale) < 0.004) {
          scale = Math.min(scale, next)
          break
        }
        scale = next
      }
      el.style.width = `${100 / scale}%`
      if (el.scrollHeight * scale > avail + 1) scale = Math.max(0.5, avail / el.scrollHeight)
      el.style.width = `${100 / scale}%`
      el.style.transform = `scale(${scale})`
    }
    fit()
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(fit)
    })
    ro.observe(o)
    Array.from(el.children).forEach((c) => ro.observe(c))
    return () => {
      ro.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <div ref={outer} className="h-full w-full overflow-hidden">
      <div ref={inner} style={{ transformOrigin: 'top left' }}>
        {children}
      </div>
    </div>
  )
}

/** Largeur des blocs : automatique (2 colonnes) ou forcée. */
export function blockSpans(blocks: Block[]): (1 | 2)[] {
  const forced = (b: Block): 1 | 2 | null => {
    if (b.width === 'full') return 2
    if (b.width === 'half') return 1
    if (b.type === 'kpis') return 2
    if (b.type === 'table' && b.columns.length > 4) return 2
    return null
  }
  const flexible = blocks.filter((b) => forced(b) === null).length
  const spans = blocks.map((b) => forced(b) ?? (flexible >= 2 ? 1 : 2))
  // Un bloc demi-largeur isolé sur sa ligne prend toute la largeur.
  let col = 0
  spans.forEach((span, i) => {
    if (span === 2) {
      col = 0
      return
    }
    const next = spans[i + 1]
    if (col === 0 && (next === undefined || next === 2) && blocks[i].width !== 'half') spans[i] = 2
    else col = (col + 1) % 2
  })
  return spans
}

export interface LayoutRow {
  cells: { block: Block; span: 1 | 2 }[]
  /** Poids relatifs des colonnes (les tableaux larges prennent plus de place). */
  weights: number[]
}

const blockWeight = (b: Block) => (b.type === 'table' ? (b.columns.length >= 4 ? 1.45 : b.columns.length === 3 ? 1.15 : 1) : 1)

/** Découpe les blocs en lignes d'une ou deux colonnes (partagé avec l'export PowerPoint). */
export function layoutRows(blocks: Block[]): LayoutRow[] {
  const spans = blockSpans(blocks)
  const rows: LayoutRow['cells'][] = []
  let current: LayoutRow['cells'] = []
  let used = 0
  blocks.forEach((block, i) => {
    const span = spans[i]
    if (used + span > 2) {
      rows.push(current)
      current = []
      used = 0
    }
    current.push({ block, span })
    used += span
    if (used === 2) {
      rows.push(current)
      current = []
      used = 0
    }
  })
  if (current.length) rows.push(current)
  return rows.map((cells) => ({ cells, weights: cells.length === 2 ? cells.map((c) => blockWeight(c.block)) : [1] }))
}

export function ServiceContentSlide({ data, slide, index }: { data: DeckRenderData; slide: Slide; index: number }) {
  const service = data.services.find((s) => s.id === slide.serviceId)
  if (!service) return null
  const palette = service.palette
  const blocks = slide.blocks.filter(blockHasContent)
  const hasKpis = blocks.some((b) => b.type === 'kpis')
  const chartHeight = hasKpis ? 360 : blocks.length > 2 ? 420 : 520

  return (
    <div className="relative flex h-full w-full flex-col bg-white">
      <div className="absolute inset-y-0 left-0 z-10 w-[14px]" style={{ background: palette.accent }} />
      <header className="flex shrink-0 items-start justify-between gap-10 pt-[50px] pb-[30px]" style={{ background: palette.tint, paddingInline: PAD_X }}>
        <div className="min-w-0">
          <div className="flex items-center gap-3 text-[26px] font-semibold" style={{ color: palette.strong }}>
            <ServiceIcon icon={service.icon} size={30} />
            {service.name}
          </div>
          <h2 className="mt-2 font-display text-[58px] leading-[1.06] font-extrabold tracking-[-0.015em] text-ink">{resolveSlideTitle(slide, data.periods)}</h2>
          <p className="mt-2 text-[26px] text-ink-2">{resolveSlideSubtitle(slide, data.periods)}</p>
        </div>
        <img src={LOGO_COLOR_URL} alt="NOVIA" className="mt-2 h-[56px] shrink-0" />
      </header>
      <main className="min-h-0 flex-1 pt-[34px] pb-[26px]" style={{ paddingInline: PAD_X }}>
        {blocks.length === 0 ? (
          <div className="grid h-full place-items-center">
            <div className="flex items-center gap-5 rounded-[24px] px-12 py-9 text-[32px] font-semibold text-ink-2" style={{ background: palette.tint }}>
              <CheckCircle2 size={44} style={{ color: palette.accent }} aria-hidden />
              Rien à signaler pour cette période
            </div>
          </div>
        ) : (
          <AutoFit key={blocks.map((b) => b.id).join('|')}>
            <div className="flex flex-col gap-y-[34px]">
              {layoutRows(blocks).map((row, r) => (
                <div key={r} className="grid gap-x-[44px]" style={{ gridTemplateColumns: row.weights.map((w) => `minmax(0, ${w}fr)`).join(' ') }}>
                  {row.cells.map(({ block, span }) => (
                    <div key={block.id} className="min-w-0">
                      <BlockView block={block} palette={palette} dense={blocks.length > 1} chartHeight={span === 2 ? Math.min(chartHeight, 400) : chartHeight} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </AutoFit>
        )}
      </main>
      <Footer data={data} index={index} />
    </div>
  )
}

// ----- Clôture --------------------------------------------------------------------------

export function ClosingSlide({ data }: { data: DeckRenderData }) {
  const next = data.nextMeeting
  const deadline = next ? submissionDeadline({ ...data.meeting, meetingDate: next.date }, data.settings) : null
  return (
    <div className="relative h-full w-full overflow-hidden bg-novia-600 text-white">
      <Diagonals tone="white" />
      <div className="absolute top-[118px] right-0 h-[2px] w-[880px] bg-white/45" />
      <img src={LOGO_LIGHT_URL} alt="NOVIA" className="absolute top-[150px] h-[150px]" style={{ right: PAD_X }} />
      <h2 className="absolute bottom-[330px] font-display text-[230px] leading-none font-extrabold tracking-[-0.03em] text-white" style={{ left: PAD_X }}>
        Merci !
      </h2>
      <div className="absolute bottom-[268px] left-0 h-[2px] w-[1100px] bg-white/45" />
      {next && (
        <div className="absolute bottom-[110px]" style={{ left: PAD_X }}>
          <p className="text-[36px] font-semibold">
            Prochaine Flash Synchro : {formatFullDate(next.date)} à {formatTime(next.time)}
          </p>
          {deadline && (
            <p className="mt-3 text-[27px]">
              Semaine {next.week} — informations à transmettre avant le {formatFullDate(deadline.date, false)}, {formatTime(deadline.time)}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ----- Aiguillage ---------------------------------------------------------------------------

export function DeckEntryView({ data, index }: { data: DeckRenderData; index: number }) {
  const entry = data.deck.entries[index]
  if (!entry) return null
  switch (entry.type) {
    case 'cover':
      return <CoverSlide data={data} />
    case 'agenda':
      return <AgendaSlide data={data} />
    case 'section':
      return <SectionSlide data={data} serviceId={entry.serviceId} />
    case 'service': {
      const slide = data.slides.find((s) => s.id === entry.slideId)
      return slide ? <ServiceContentSlide data={data} slide={slide} index={index} /> : null
    }
    case 'closing':
      return <ClosingSlide data={data} />
  }
}
