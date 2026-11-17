import { diffInDays, parseDate } from '@/domain/isoWeek'

// ---------------------------------------------------------------------------
// Formatage français des dates, périodes, nombres et durées
// ---------------------------------------------------------------------------

const MONTHS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]
const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
export const WEEKDAY_LABELS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** « 1er » pour le premier jour du mois, sinon le nombre. */
const dayNumber = (d: number) => (d === 1 ? '1er' : String(d))

function parts(iso: string) {
  const d = parseDate(iso)
  return { day: d.getUTCDate(), month: d.getUTCMonth(), year: d.getUTCFullYear(), weekday: d.getUTCDay() }
}

/** 16 novembre 2026 */
export function formatLongDate(iso: string, withYear = true): string {
  const p = parts(iso)
  return `${dayNumber(p.day)} ${MONTHS[p.month]}${withYear ? ` ${p.year}` : ''}`
}

/** jeudi 19 novembre 2026 */
export function formatFullDate(iso: string, withYear = true): string {
  const p = parts(iso)
  return `${WEEKDAYS[p.weekday]} ${formatLongDate(iso, withYear)}`
}

/** Jeudi 19 novembre */
export function formatFullDateCap(iso: string, withYear = false): string {
  return capitalize(formatFullDate(iso, withYear))
}

/** 19 nov. */
export function formatShortDate(iso: string): string {
  const p = parts(iso)
  return `${dayNumber(p.day)} ${MONTHS_SHORT[p.month]}`
}

/** jeu. 19 nov. */
export function formatShortWeekdayDate(iso: string): string {
  const p = parts(iso)
  return `${WEEKDAYS[p.weekday].slice(0, 3)}. ${formatShortDate(iso)}`
}

/** 19/11/2026 */
export function formatNumericDate(iso: string): string {
  const p = parts(iso)
  return `${String(p.day).padStart(2, '0')}/${String(p.month + 1).padStart(2, '0')}/${p.year}`
}

/**
 * Période en toutes lettres :
 *  « du 16 au 22 novembre 2026 », « du 26 octobre au 1er novembre 2026 »,
 *  « du 28 décembre 2026 au 3 janvier 2027 ».
 */
export function formatPeriod(start: string, end: string): string {
  const a = parts(start)
  const b = parts(end)
  if (a.year !== b.year) return `du ${formatLongDate(start)} au ${formatLongDate(end)}`
  if (a.month !== b.month) return `du ${dayNumber(a.day)} ${MONTHS[a.month]} au ${dayNumber(b.day)} ${MONTHS[b.month]} ${b.year}`
  return `du ${dayNumber(a.day)} au ${dayNumber(b.day)} ${MONTHS[b.month]} ${b.year}`
}

/** Période courte : « 16–22 nov. », « 26 oct.–1er nov. » */
export function formatPeriodShort(start: string, end: string): string {
  const a = parts(start)
  const b = parts(end)
  if (a.month === b.month && a.year === b.year) return `${dayNumber(a.day)}–${dayNumber(b.day)} ${MONTHS_SHORT[b.month]}`
  return `${formatShortDate(start)}–${formatShortDate(end)}`
}

/** « aujourd'hui », « demain », « dans 3 jours », « il y a 2 jours » */
export function formatRelativeDay(target: string, today: string): string {
  const diff = diffInDays(target, today)
  if (diff === 0) return "aujourd'hui"
  if (diff === 1) return 'demain'
  if (diff === -1) return 'hier'
  if (diff > 1) return `dans ${diff} jours`
  return `il y a ${-diff} jours`
}

/** Horaire de planning, toujours avec les minutes : « 10 h 00 ». */
export function formatHour(time: string): string {
  return time.replace(':', ' h ')
}

export function formatTime(time: string): string {
  return time.replace(':', ' h ').replace(/ h 00$/, ' h')
}

/** Additionne des minutes à une heure HH:mm. */
export function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = (h * 60 + m + minutes + 24 * 60) % (24 * 60)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/** Chronomètre : 4:05, 12:30, 1:02:03 ; préfixe « + » pour un dépassement. */
export function formatClock(ms: number, opts: { signed?: boolean } = {}): string {
  const negative = ms < 0
  const totalSeconds = Math.floor(Math.abs(ms) / 1000)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  const body = h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
  if (opts.signed && negative) return `+${body}`
  return body
}

/** Durée lisible : « 6 min », « 1 h 05 », « 45 s » */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`
}

const numberFormatter = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 })
export const formatNumber = (n: number) => numberFormatter.format(n)

/** Analyse un nombre saisi à la française : « 1 234,5 », « 89 % », « 12.5 ». */
export function parseNumber(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  const cleaned = raw.replace(/[\s  ]/g, '').replace('%', '').replace('€', '').replace(',', '.')
  if (!/^[-+]?\d*\.?\d+$/.test(cleaned)) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

export function pluralize(n: number, singular: string, plural?: string): string {
  return `${n} ${n > 1 ? (plural ?? `${singular}s`) : singular}`
}
