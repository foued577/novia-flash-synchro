import type PptxGenJS from 'pptxgenjs'
import { LOGO_COLOR_URL, LOGO_LIGHT_URL } from '@/components/brand/Logo'
import type { DeckRenderData } from '@/components/slides/context'
import { layoutRows } from '@/components/slides/DeckSlides'
import { kpiDelta } from '@/components/slides/BlockViews'
import { blockHasContent, computeTotalRow, donutColor, isNumericColumn, seriesColor } from '@/domain/blocks'
import { parseDate } from '@/domain/isoWeek'
import { resolveSlideSubtitle, resolveSlideTitle } from '@/domain/periods'
import { submissionDeadline } from '@/domain/selectors'
import { SEVERITY } from '@/domain/status'
import type { Block, Service, ServicePalette, Slide } from '@/domain/types'
import { readAsDataUrl, imageToPngDataUrl } from '@/lib/files'
import { addMinutesToTime, formatFullDate, formatPeriod, formatTime } from '@/lib/format'
import { saveFile, type SaveOutcome } from '@/lib/platform'
import { deckFileName } from './exportPdf'

// ---------------------------------------------------------------------------
// Export PowerPoint natif (pptxgenjs) : textes, tableaux et graphiques restent
// modifiables dans PowerPoint. Coordonnées : toile 1920×1080 → 13,33 × 7,5 po.
// ---------------------------------------------------------------------------

type Pptx = PptxGenJS
type PSlide = PptxGenJS.Slide
type TextRun = PptxGenJS.TextProps

const P = (px: number) => px / 144 // pixels logiques → pouces
const F = (px: number) => Math.max(6, Math.round(px * 0.5 * 10) / 10) // pixels logiques → points
const C = (hex: string) => hex.replace('#', '').toUpperCase()
const FONT = 'Montserrat'
const INK = '1C2638'
const INK2 = '4A5568'
const INK3 = '77839A'
const LINE = 'E2E7EF'
const PAD = 104
const LOGO_RATIO = 480 / 142

interface Assets {
  logo: string
  logoLight: string
}

async function toBase64(url: string) {
  if (url.startsWith('data:')) return url
  const res = await fetch(url)
  return readAsDataUrl(await res.blob())
}

function text(slide: PSlide, value: string | TextRun[], x: number, y: number, w: number, h: number, opts: PptxGenJS.TextPropsOptions = {}) {
  slide.addText(value, { x: P(x), y: P(y), w: P(w), h: P(h), fontFace: FONT, color: INK, margin: 0, valign: 'top', ...opts })
}

function rect(slide: PSlide, x: number, y: number, w: number, h: number, color: string, radius = 0) {
  slide.addShape(radius ? 'roundRect' : 'rect', {
    x: P(x),
    y: P(y),
    w: P(w),
    h: P(h),
    fill: { color: C(color) },
    line: { color: C(color), width: 0 },
    ...(radius ? { rectRadius: Math.min(0.5, radius / Math.min(w, h)) } : {}),
  })
}

function schedule(data: DeckRenderData) {
  let cursor = 0
  return data.services.map((s) => {
    const minutes = data.meeting.durations[s.id] ?? s.durationMinutes
    const start = addMinutesToTime(data.meeting.meetingTime, cursor)
    cursor += minutes
    return { service: s, minutes, start, end: addMinutesToTime(data.meeting.meetingTime, cursor) }
  })
}

function ribbon(slide: PSlide, data: DeckRenderData, y: number) {
  const rows = schedule(data)
  const total = rows.reduce((a, r) => a + r.minutes, 0) || 1
  const width = 1920 - PAD * 2
  const gap = 5
  let x = PAD
  rows.forEach((r) => {
    const w = (r.minutes / total) * (width - gap * (rows.length - 1))
    rect(slide, x, y, w, 62, r.service.palette.accent, 8)
    text(slide, [{ text: `${r.service.shortName}  `, options: { bold: true } }, { text: `${r.minutes} min` }], x + 14, y, w - 20, 62, { fontSize: F(22), color: 'FFFFFF', valign: 'middle', fit: 'shrink' })
    text(slide, formatTime(r.start), x, y + 72, 160, 30, { fontSize: F(20), color: INK3, bold: true })
    x += w + gap
  })
  text(slide, formatTime(rows.at(-1)?.end ?? data.meeting.meetingTime), 1920 - PAD - 160, y + 72, 160, 30, { fontSize: F(20), color: INK3, bold: true, align: 'right' })
}

function footer(slide: PSlide, data: DeckRenderData, index: number) {
  slide.addShape('line', { x: 0, y: P(1016), w: P(1920), h: 0, line: { color: LINE, width: 0.75 } })
  text(slide, `Flash Synchro – Semaine ${data.meeting.isoWeek}`, PAD, 1034, 900, 30, { fontSize: F(20), color: INK3 })
  text(slide, `${index + 1} / ${data.deck.entries.length}`, 1920 - PAD - 300, 1034, 300, 30, { fontSize: F(20), color: INK3, align: 'right' })
}

// ----- Diapositives fixes -----------------------------------------------------------

function coverSlide(pptx: Pptx, data: DeckRenderData, a: Assets) {
  const s = pptx.addSlide()
  s.background = { color: 'F7F9FC' }
  s.addImage({ data: a.logo, x: P(PAD), y: P(88), w: P(74 * LOGO_RATIO), h: P(74) })
  text(s, data.settings.tagline, PAD, 272, 1200, 46, { fontSize: F(30), bold: true, color: '3661B3' })
  text(s, 'Flash Synchro', PAD - 6, 322, 1500, 200, { fontSize: F(168), bold: true, color: '3661B3' })
  rect(s, PAD, 548, 520, 8, '#229CD7', 4)
  text(s, `Semaine ${data.meeting.isoWeek}`, PAD, 592, 1200, 80, { fontSize: F(66), bold: true, color: '2C4F95' })
  text(s, formatPeriod(data.periods.week.start, data.periods.week.end), PAD, 680, 1200, 56, { fontSize: F(40), bold: true, color: '4570BE' })
  const bilan = data.periods.review.weeks.length > 1 ? `des ${data.periods.review.label.toLowerCase()}` : `de la ${data.periods.review.label.toLowerCase()}`
  text(s, `Bilan ${bilan} et prévisions de la ${data.periods.forecast.label.toLowerCase()}`, PAD, 748, 1200, 40, { fontSize: F(28), color: INK2 })
  const total = data.services.reduce((acc, sv) => acc + (data.meeting.durations[sv.id] ?? sv.durationMinutes), 0)
  text(s, `Réunion du ${formatFullDate(data.meeting.meetingDate)} à ${formatTime(data.meeting.meetingTime)} — ${total} minutes`, PAD, 846, 1500, 40, { fontSize: F(27), color: INK2 })
  ribbon(s, data, 900)
}

function agendaSlide(pptx: Pptx, data: DeckRenderData, a: Assets) {
  const s = pptx.addSlide()
  s.background = { color: 'FFFFFF' }
  rect(s, 0, 0, 14, 1080, '#3661B3')
  text(s, 'Ordre du jour', PAD, 64, 1200, 76, { fontSize: F(64), bold: true, color: '3661B3' })
  text(s, `Flash Synchro – Semaine ${data.meeting.isoWeek} – ${formatPeriod(data.periods.week.start, data.periods.week.end)}`, PAD, 152, 1400, 40, { fontSize: F(28), color: INK2 })
  s.addImage({ data: a.logo, x: P(1920 - PAD - 58 * LOGO_RATIO), y: P(64), w: P(58 * LOGO_RATIO), h: P(58) })
  const rows = schedule(data)
  const max = Math.max(...rows.map((r) => r.minutes), 1)
  const top = 240
  const rowH = Math.min(132, 720 / Math.max(rows.length, 1))
  rows.forEach((r, i) => {
    const y = top + i * rowH
    if (i > 0) s.addShape('line', { x: P(PAD), y: P(y), w: P(1920 - PAD * 2), h: 0, line: { color: LINE, width: 0.75 } })
    const cy = y + rowH / 2
    text(s, `${formatTime(r.start)} – ${formatTime(r.end)}`, PAD, cy - 20, 250, 40, { fontSize: F(28), bold: true, color: INK2, valign: 'middle' })
    rect(s, PAD + 280, cy - 35, 70, 70, r.service.palette.accent, 18)
    text(s, r.service.name, PAD + 386, cy - 40, 760, 50, { fontSize: F(36), bold: true, valign: 'middle' })
    const manager = data.users.find((u) => u.id === r.service.managerId)
    if (manager) text(s, `${manager.fullName}, ${manager.jobTitle.toLowerCase()}`, PAD + 386, cy + 10, 760, 34, { fontSize: F(23), color: INK2 })
    rect(s, 1250, cy - 7, 380, 14, '#F3F5F9', 7)
    rect(s, 1250, cy - 7, Math.max(14, (r.minutes / max) * 380), 14, r.service.palette.accent, 7)
    text(s, `${r.minutes} min`, 1920 - PAD - 170, cy - 26, 170, 52, { fontSize: F(40), bold: true, align: 'right', valign: 'middle' })
  })
  const total = rows.reduce((acc, r) => acc + r.minutes, 0)
  s.addShape('line', { x: P(PAD), y: P(980), w: P(1920 - PAD * 2), h: 0, line: { color: LINE, width: 0.75 } })
  text(s, [{ text: 'Durée totale : ' }, { text: `${total} minutes`, options: { bold: true, color: INK } }], PAD, 1000, 800, 40, { fontSize: F(26), color: INK2 })
  text(s, [{ text: 'Fin prévue à ' }, { text: formatTime(rows.at(-1)?.end ?? data.meeting.meetingTime), options: { bold: true, color: INK } }], 1920 - PAD - 600, 1000, 600, 40, { fontSize: F(26), color: INK2, align: 'right' })
}

function sectionSlide(pptx: Pptx, data: DeckRenderData, serviceId: string, a: Assets) {
  const rows = schedule(data)
  const position = rows.findIndex((r) => r.service.id === serviceId)
  const row = rows[position]
  if (!row) return
  const service = row.service
  const s = pptx.addSlide()
  s.background = { color: C(service.palette.accent) }
  s.addImage({ data: a.logoLight, x: P(1920 - PAD - 66 * (720 / 213)), y: P(84), w: P(66 * (720 / 213)), h: P(66) })
  text(s, `Service ${position + 1} sur ${rows.length}`, PAD, 300, 1000, 44, { fontSize: F(30), bold: true, color: 'FFFFFF' })
  text(s, service.name, PAD, 350, 1060, 250, { fontSize: F(100), bold: true, color: 'FFFFFF', fit: 'shrink' })
  const manager = data.users.find((u) => u.id === service.managerId)
  if (manager) text(s, `${manager.fullName}, ${manager.jobTitle.toLowerCase()}`, PAD, 610, 1060, 44, { fontSize: F(32), color: 'FFFFFF' })
  text(s, [{ text: `${row.minutes}`, options: { fontSize: F(96), bold: true } }, { text: ' minutes', options: { fontSize: F(42), bold: true } }], PAD, 800, 800, 110, { color: 'FFFFFF', valign: 'bottom' })
  text(s, `${formatTime(row.start)} – ${formatTime(row.end)}`, PAD, 920, 800, 44, { fontSize: F(30), bold: true, color: 'FFFFFF' })
  const slides = data.slides.filter((sl) => sl.serviceId === serviceId && !sl.hidden).sort((x, y) => x.position - y.position)
  if (slides.length) {
    const h = 64 + slides.length * 50
    s.addShape('roundRect', { x: P(1920 - PAD - 640), y: P(976 - h), w: P(640), h: P(h), fill: { color: 'FFFFFF', transparency: 86 }, line: { color: 'FFFFFF', width: 0, transparency: 100 }, rectRadius: 0.08 })
    text(
      s,
      slides.map((sl, i) => ({ text: `${i + 1}   ${resolveSlideTitle(sl, data.periods)}`, options: { breakLine: true } })),
      1920 - PAD - 600,
      976 - h + 32,
      560,
      h - 64,
      { fontSize: F(27), bold: true, color: 'FFFFFF', paraSpaceAfter: 6 },
    )
  }
}

function closingSlide(pptx: Pptx, data: DeckRenderData, a: Assets) {
  const s = pptx.addSlide()
  s.background = { color: '3661B3' }
  s.addShape('line', { x: P(1040), y: P(118), w: P(880), h: 0, line: { color: 'FFFFFF', width: 1.5, transparency: 55 } })
  s.addImage({ data: a.logoLight, x: P(1920 - PAD - 150 * (720 / 213)), y: P(150), w: P(150 * (720 / 213)), h: P(150) })
  text(s, 'Merci !', PAD, 500, 1400, 260, { fontSize: F(230), bold: true, color: 'FFFFFF', valign: 'bottom' })
  s.addShape('line', { x: 0, y: P(812), w: P(1100), h: 0, line: { color: 'FFFFFF', width: 1.5, transparency: 55 } })
  const next = data.nextMeeting
  if (next) {
    text(s, `Prochaine Flash Synchro : ${formatFullDate(next.date)} à ${formatTime(next.time)}`, PAD, 860, 1700, 50, { fontSize: F(36), bold: true, color: 'FFFFFF' })
    const deadline = submissionDeadline({ ...data.meeting, meetingDate: next.date }, data.settings)
    text(s, `Semaine ${next.week} — informations à transmettre avant le ${formatFullDate(deadline.date, false)}, ${formatTime(deadline.time)}`, PAD, 920, 1700, 44, { fontSize: F(27), color: 'FFFFFF' })
  }
}

// ----- Blocs -------------------------------------------------------------------------------

const STATUS_MARK: Record<string, { char: string; color: string }> = {
  done: { char: '✓', color: '15803D' },
  ongoing: { char: '◔', color: 'B45309' },
  todo: { char: '○', color: INK3 },
}

const DAYS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.']
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const shortDate = (iso: string) => {
  const d = parseDate(iso)
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

async function renderBlock(pptx: Pptx, s: PSlide, block: Block, palette: ServicePalette, x: number, y: number, w: number, h: number) {
  if (block.title.trim()) {
    text(s, block.title, x, y, w, 36, { fontSize: F(26), bold: true })
    y += 46
    h -= 46
  }
  switch (block.type) {
    case 'kpis': {
      const items = block.items.filter((i) => i.label.trim() || i.value.trim())
      const cols = Math.max(1, items.length <= 5 ? items.length : 4)
      const rowsCount = Math.ceil(items.length / cols)
      const gap = 24
      const tw = (w - gap * (cols - 1)) / cols
      const th = Math.min(220, (h - gap * (rowsCount - 1)) / rowsCount)
      items.forEach((item, i) => {
        const tx = x + (i % cols) * (tw + gap)
        const ty = y + Math.floor(i / cols) * (th + gap)
        rect(s, tx, ty, tw, th, palette.tint, 20)
        text(s, item.label, tx + 26, ty + 18, tw - 52, 44, { fontSize: F(21), bold: true, color: INK2, fit: 'shrink' })
        text(s, [{ text: item.value || '—', options: { fontSize: F(th < 210 ? 54 : 64), bold: true, color: INK } }, ...(item.unit ? [{ text: ` ${item.unit}`, options: { fontSize: F(28), bold: true, color: INK2 } }] : [])], tx + 26, ty + 62, tw - 52, 76, { valign: 'middle' })
        const d = kpiDelta(item)
        if (d || item.previous) {
          const color = !d ? INK3 : d.tone === 'good' ? '15803D' : d.tone === 'bad' ? 'B42318' : '5C6880'
          text(s, [...(d ? [{ text: `${d.label}  `, options: { bold: true, color } }] : []), { text: item.previous ? `précédemment ${item.previous}` : '', options: { color: INK3 } }], tx + 26, ty + th - 46, tw - 40, 30, { fontSize: F(19) })
        }
      })
      return
    }
    case 'list': {
      const items = block.items.filter((i) => i.text.trim())
      const runs: TextRun[] = []
      items.forEach((item, i) => {
        const mark = item.status !== 'none' ? STATUS_MARK[item.status] : null
        const prefix = mark ? `${mark.char}  ` : block.style === 'numbered' ? `${i + 1}.  ` : '■  '
        runs.push({ text: prefix, options: { color: mark?.color ?? C(palette.accent), bold: true } })
        runs.push({ text: item.text, options: { color: INK, breakLine: true } })
      })
      text(s, runs, x, y, w, h, { fontSize: F(items.length > 6 ? 24 : 27), paraSpaceAfter: 8, fit: 'shrink' })
      return
    }
    case 'table': {
      const rows = block.rows.filter((r) => r.some((c) => c.trim()))
      const total = block.totalRow ? computeTotalRow({ columns: block.columns, rows }) : null
      const numeric = block.columns.map((_, i) => i > 0 && isNumericColumn(rows, i))
      const count = rows.length + (total ? 1 : 0) + 1
      const captionH = block.caption ? 36 : 0
      // Hauteur de ligne et taille de police calculées pour tenir dans le cadre.
      const rowPx = Math.min(46, (h - captionH) / count)
      const fontSize = F(Math.max(12, Math.min(22, rowPx * 0.46)))
      const lengths = block.columns.map((c, i) => Math.max(c.length, ...rows.map((r) => (r[i] ?? '').length), 3))
      const sum = lengths.reduce((a, b) => a + b, 0)
      const colW = lengths.map((l) => P((l / sum) * w))
      const head: PptxGenJS.TableRow = block.columns.map((c, i) => ({ text: c, options: { bold: true, color: 'FFFFFF', fill: { color: C(palette.strong) }, align: numeric[i] ? 'right' : 'left' } }))
      const body: PptxGenJS.TableRow[] = rows.map((r, ri) =>
        block.columns.map((_, ci) => ({ text: r[ci] ?? '', options: { color: INK, bold: ci === 0, fill: { color: ri % 2 === 1 ? C(palette.tint) : 'FFFFFF' }, align: numeric[ci] ? 'right' : 'left' } })),
      )
      if (total) body.push(total.map((cell, ci) => ({ text: cell, options: { bold: true, color: INK, fill: { color: C(palette.tint) }, align: numeric[ci] ? 'right' : 'left' } })))
      s.addTable([head, ...body], { x: P(x), y: P(y), w: P(w), colW, fontFace: FONT, fontSize, rowH: P(rowPx), border: { type: 'solid', pt: 0.5, color: LINE }, margin: [0.02, 0.06, 0.02, 0.06], valign: 'middle', autoPage: false })
      if (block.caption) text(s, block.caption, x, y + count * rowPx + 8, w, 28, { fontSize: F(18), color: INK3 })
      return
    }
    case 'chart': {
      if (block.categories.length === 0 || block.series.length === 0) return
      const multi = block.series.length > 1
      const common: PptxGenJS.IChartOpts = {
        x: P(x),
        y: P(y),
        w: P(w),
        h: P(h),
        catAxisLabelFontFace: FONT,
        catAxisLabelFontSize: 10,
        catAxisLabelColor: '5C6880',
        valAxisLabelFontSize: 9,
        valAxisLabelColor: '5C6880',
        valGridLine: { color: 'E6EAF1', style: 'solid', size: 0.75 },
        catGridLine: { style: 'none' },
        dataLabelFontFace: FONT,
        dataLabelFontSize: 10,
        dataLabelColor: '2B3445',
        showLegend: multi || block.chartType === 'donut',
        legendPos: block.chartType === 'donut' ? 'r' : 't',
        legendFontFace: FONT,
        legendFontSize: 10,
      }
      if (block.chartType === 'donut') {
        const serie = block.series[0]
        s.addChart(pptx.ChartType.doughnut, [{ name: serie.name, labels: block.categories, values: block.categories.map((_, i) => serie.values[i] ?? 0) }], {
          ...common,
          holeSize: 58,
          chartColors: block.categories.map((_, i) => C(donutColor(i))),
          showPercent: true,
          showValue: false,
          dataLabelColor: 'FFFFFF',
        })
        return
      }
      const data = block.series.map((serie) => ({ name: serie.name, labels: block.categories, values: block.categories.map((_, i) => serie.values[i] ?? 0) }))
      const colors = block.series.map((_, j) => C(seriesColor(block, j, palette.accent)))
      if (block.chartType === 'line') {
        s.addChart(pptx.ChartType.line, data, { ...common, chartColors: colors, lineSize: 2.5, lineDataSymbolSize: 8, showValue: block.showValues, dataLabelPosition: 't' })
        return
      }
      const horizontal = block.chartType === 'horizontal'
      const stacked = block.chartType === 'stacked' || (horizontal && multi)
      s.addChart(pptx.ChartType.bar, data, {
        ...common,
        chartColors: colors,
        barDir: horizontal ? 'bar' : 'col',
        barGrouping: stacked ? 'stacked' : 'clustered',
        barGapWidthPct: 60,
        showValue: block.showValues && !stacked,
        dataLabelPosition: 'outEnd',
        ...(horizontal ? ({ catAxisOrientation: 'maxMin' } as unknown as PptxGenJS.IChartOpts) : {}),
      })
      return
    }
    case 'text': {
      const tones = { neutral: null, info: ['EEF3FB', '2C4F95'], success: ['ECF8F0', '166534'], warning: ['FEF6E7', '8A4B06'], danger: ['FDEEEE', 'A12A2A'] } as const
      const tone = tones[block.tone]
      if (!tone) {
        text(s, block.text, x, y, w, h, { fontSize: F(27), fit: 'shrink' })
      } else {
        const boxH = Math.min(h, 40 + Math.ceil(block.text.length / 70) * 40)
        rect(s, x, y, w, boxH, `#${tone[0]}`, 16)
        text(s, block.text, x + 28, y + 16, w - 56, boxH - 32, { fontSize: F(26), bold: true, color: tone[1], valign: 'middle', fit: 'shrink' })
      }
      return
    }
    case 'image': {
      const boxH = h - (block.caption ? 40 : 0)
      try {
        const img = await imageToPngDataUrl(block.src)
        const ratio = img.width / img.height
        let iw = w
        let ih = w / ratio
        if (block.fit === 'contain' && ih > boxH) {
          ih = boxH
          iw = boxH * ratio
        }
        if (block.fit === 'cover') {
          s.addImage({ data: img.data, x: P(x), y: P(y), w: P(w), h: P(boxH), sizing: { type: 'cover', w: P(w), h: P(boxH) } })
        } else {
          s.addImage({ data: img.data, x: P(x + (w - iw) / 2), y: P(y + (boxH - ih) / 2), w: P(iw), h: P(ih) })
        }
      } catch {
        text(s, 'Image indisponible', x, y, w, 40, { fontSize: F(20), color: INK3 })
      }
      if (block.caption) text(s, block.caption, x, y + h - 34, w, 30, { fontSize: F(18), color: INK3 })
      return
    }
    case 'events': {
      const items = block.items.filter((i) => i.title.trim()).sort((a, b) => (a.date || '9').localeCompare(b.date || '9'))
      const runs: TextRun[] = []
      items.forEach((item) => {
        const when = item.date ? `${shortDate(item.date)}${item.endDate ? ` au ${shortDate(item.endDate)}` : ''}${item.time ? `, ${formatTime(item.time)}` : ''}` : 'À dater'
        runs.push({ text: `${when}   `, options: { bold: true, color: C(palette.strong) } })
        runs.push({ text: item.title, options: { bold: true, color: INK, breakLine: !item.detail } })
        if (item.detail) runs.push({ text: `  —  ${item.detail}`, options: { color: INK2, breakLine: true } })
      })
      text(s, runs, x, y, w, h, { fontSize: F(25), paraSpaceAfter: 10, fit: 'shrink' })
      return
    }
    case 'issues': {
      const items = block.items.filter((i) => i.title.trim())
      const runs: TextRun[] = []
      items.forEach((item) => {
        const sev = SEVERITY[item.severity]
        runs.push({ text: `${sev.label.toUpperCase()}   `, options: { bold: true, color: C(sev.color), fontSize: F(19) } })
        runs.push({ text: item.title, options: { bold: true, color: INK, breakLine: true } })
        if (item.detail) runs.push({ text: item.detail, options: { color: INK2, breakLine: true, fontSize: F(22) } })
        if (item.need) runs.push({ text: `Besoin : ${item.need}`, options: { color: '2C4F95', breakLine: true, fontSize: F(22) } })
      })
      text(s, runs, x, y, w, h, { fontSize: F(26), paraSpaceAfter: 10, fit: 'shrink' })
      return
    }
  }
}

async function serviceSlide(pptx: Pptx, data: DeckRenderData, slide: Slide, service: Service, index: number, a: Assets) {
  const s = pptx.addSlide()
  const palette = service.palette
  s.background = { color: 'FFFFFF' }
  rect(s, 0, 0, 1920, 232, palette.tint)
  rect(s, 0, 0, 14, 1080, palette.accent)
  text(s, service.name, PAD, 50, 1400, 40, { fontSize: F(26), bold: true, color: C(palette.strong) })
  text(s, resolveSlideTitle(slide, data.periods), PAD, 92, 1450, 72, { fontSize: F(56), bold: true, fit: 'shrink' })
  text(s, resolveSlideSubtitle(slide, data.periods), PAD, 168, 1450, 40, { fontSize: F(26), color: INK2 })
  s.addImage({ data: a.logo, x: P(1920 - PAD - 56 * LOGO_RATIO), y: P(58), w: P(56 * LOGO_RATIO), h: P(56) })
  if (slide.notes.trim()) s.addNotes(slide.notes)

  const blocks = slide.blocks.filter(blockHasContent)
  if (blocks.length === 0) {
    rect(s, 560, 520, 800, 120, palette.tint, 24)
    text(s, 'Rien à signaler pour cette période', 560, 520, 800, 120, { fontSize: F(32), bold: true, color: INK2, align: 'center', valign: 'middle' })
  } else {
    const rows = layoutRows(blocks)
    const top = 266
    const bottom = 996
    const gapY = 30
    const width = 1920 - PAD * 2
    const gapX = 44
    const kpiRowH = rows.length > 1 ? 200 : 240
    const fixed = rows.map((r) => (r.cells.length === 1 && r.cells[0].block.type === 'kpis' ? kpiRowH + (r.cells[0].block.title.trim() ? 46 : 0) : 0))
    const flexibleCount = fixed.filter((f) => f === 0).length || 1
    const remaining = bottom - top - fixed.reduce((a, b) => a + b, 0) - gapY * (rows.length - 1)
    let y = top
    for (let r = 0; r < rows.length; r++) {
      const h = fixed[r] || remaining / flexibleCount
      let x = PAD
      const row = rows[r]
      const totalWeight = row.weights.reduce((a, b) => a + b, 0)
      const usable = width - gapX * (row.cells.length - 1)
      for (let c = 0; c < row.cells.length; c++) {
        const w = row.cells.length === 1 ? width : (usable * row.weights[c]) / totalWeight
        await renderBlock(pptx, s, row.cells[c].block, palette, x, y, w, h)
        x += w + gapX
      }
      y += h + gapY
    }
  }
  footer(s, data, index)
}

export async function exportDeckToPptx(data: DeckRenderData, onProgress?: (done: number, total: number) => void): Promise<SaveOutcome> {
  const { default: PptxGenJSCtor } = await import('pptxgenjs')
  const pptx = new PptxGenJSCtor()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.author = data.settings.orgName
  pptx.company = data.settings.orgName
  pptx.title = `Flash Synchro – Semaine ${data.meeting.isoWeek}`
  pptx.theme = { headFontFace: FONT, bodyFontFace: FONT }

  const assets: Assets = { logo: await toBase64(LOGO_COLOR_URL), logoLight: await toBase64(LOGO_LIGHT_URL) }
  const total = data.deck.entries.length
  for (let i = 0; i < total; i++) {
    const entry = data.deck.entries[i]
    if (entry.type === 'cover') coverSlide(pptx, data, assets)
    else if (entry.type === 'agenda') agendaSlide(pptx, data, assets)
    else if (entry.type === 'section') sectionSlide(pptx, data, entry.serviceId, assets)
    else if (entry.type === 'closing') closingSlide(pptx, data, assets)
    else {
      const slide = data.slides.find((sl) => sl.id === entry.slideId)
      const service = data.services.find((sv) => sv.id === entry.serviceId)
      if (slide && service) await serviceSlide(pptx, data, slide, service, i, assets)
    }
    onProgress?.(i + 1, total)
  }
  const blob = (await pptx.write({ outputType: 'blob' })) as Blob
  return saveFile(blob, deckFileName(data, 'pptx'))
}
