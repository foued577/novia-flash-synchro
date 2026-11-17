// ---------------------------------------------------------------------------
// Calendrier ISO 8601 (norme française NF EN 28601)
//  - la semaine commence le lundi ;
//  - la semaine 1 est celle qui contient le premier jeudi de l'année
//    (donc le 4 janvier) ;
//  - une année ISO compte 52 ou 53 semaines.
//
// Toutes les dates « calendrier » sont manipulées sous forme de chaînes
// YYYY-MM-DD et converties en minuit UTC pour les calculs : aucun risque de
// décalage lié aux changements d'heure.
// ---------------------------------------------------------------------------

export interface IsoWeekRef {
  year: number
  week: number
}

export interface WeekInfo extends IsoWeekRef {
  /** Lundi (YYYY-MM-DD). */
  start: string
  /** Dimanche (YYYY-MM-DD). */
  end: string
}

const DAY_MS = 86_400_000

const pad = (n: number) => String(n).padStart(2, '0')

/** Convertit une date calendrier YYYY-MM-DD en Date UTC à minuit. */
export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) throw new Error(`Date invalide : « ${iso} »`)
  return new Date(Date.UTC(y, m - 1, d))
}

/** Formate une Date UTC en YYYY-MM-DD. */
export function formatDate(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

export function addDays(iso: string, days: number): string {
  return formatDate(new Date(parseDate(iso).getTime() + days * DAY_MS))
}

export function diffInDays(a: string, b: string): number {
  return Math.round((parseDate(a).getTime() - parseDate(b).getTime()) / DAY_MS)
}

/** Jour ISO de la semaine : 1 = lundi … 7 = dimanche. */
export function isoWeekday(iso: string): number {
  const day = parseDate(iso).getUTCDay()
  return day === 0 ? 7 : day
}

/** Numéro de semaine ISO et année ISO d'une date. */
export function getIsoWeek(iso: string): IsoWeekRef {
  const date = parseDate(iso)
  // Jeudi de la même semaine : il détermine l'année ISO.
  const thursday = new Date(date.getTime() + (4 - isoWeekday(iso)) * DAY_MS)
  const year = thursday.getUTCFullYear()
  const firstThursday = isoWeekThursday(year, 1)
  const week = 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * DAY_MS))
  return { year, week }
}

function isoWeekThursday(year: number, week: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const jan4Weekday = jan4.getUTCDay() === 0 ? 7 : jan4.getUTCDay()
  const mondayWeek1 = jan4.getTime() - (jan4Weekday - 1) * DAY_MS
  return new Date(mondayWeek1 + ((week - 1) * 7 + 3) * DAY_MS)
}

/** Lundi d'une semaine ISO (YYYY-MM-DD). */
export function isoWeekStart(year: number, week: number): string {
  return formatDate(new Date(isoWeekThursday(year, week).getTime() - 3 * DAY_MS))
}

/** Nombre de semaines de l'année ISO (52 ou 53). */
export function isoWeeksInYear(year: number): number {
  // Le 28 décembre appartient toujours à la dernière semaine ISO de l'année.
  return getIsoWeek(`${year}-12-28`).week
}

export function weekInfo(year: number, week: number): WeekInfo {
  const start = isoWeekStart(year, week)
  return { year, week, start, end: addDays(start, 6) }
}

export function weekOf(iso: string): WeekInfo {
  const { year, week } = getIsoWeek(iso)
  return weekInfo(year, week)
}

/** Décale une semaine ISO de n semaines (gère les années à 53 semaines). */
export function shiftWeek(ref: IsoWeekRef, n: number): WeekInfo {
  const start = addDays(isoWeekStart(ref.year, ref.week), n * 7)
  return weekOf(start)
}

export function compareWeeks(a: IsoWeekRef, b: IsoWeekRef): number {
  return a.year !== b.year ? a.year - b.year : a.week - b.week
}

export function sameWeek(a: IsoWeekRef, b: IsoWeekRef): boolean {
  return a.year === b.year && a.week === b.week
}

export function weekKey(ref: IsoWeekRef): string {
  return `${ref.year}-S${pad(ref.week)}`
}

/** Date du jour dans le fuseau Europe/Paris (YYYY-MM-DD). */
export function todayInParis(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** Heure courante à Paris (HH:mm). */
export function nowTimeInParis(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).format(now)
}

/** Date d'un jour ISO donné (1–7) dans une semaine ISO. */
export function dateInWeek(ref: IsoWeekRef, weekday: number): string {
  return addDays(isoWeekStart(ref.year, ref.week), Math.min(7, Math.max(1, weekday)) - 1)
}

/**
 * Prochaine occurrence du jour de réunion à partir d'aujourd'hui (inclus).
 * Si la réunion du jour est déjà passée (heure dépassée), on prend la semaine suivante.
 */
export function nextMeetingDate(today: string, weekday: number, time?: string, nowTime?: string): string {
  const delta = (weekday - isoWeekday(today) + 7) % 7
  if (delta === 0 && time && nowTime && nowTime > time) return addDays(today, 7)
  return addDays(today, delta)
}
