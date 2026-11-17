import { formatLongDate, formatPeriod, formatPeriodShort } from '@/lib/format'
import { shiftWeek, weekInfo, type WeekInfo } from './isoWeek'
import type { ForecastReference, Meeting, SlideKind } from './types'

// ---------------------------------------------------------------------------
// Périodes d'une réunion Flash Synchro
//   S    = semaine ISO de la réunion
//   S-1  = semaine(s) de réalisations (1 à 4 semaines selon la réunion)
//   S+1  = semaine de prévisions (ou S selon le paramétrage)
// ---------------------------------------------------------------------------

export interface MeetingPeriods {
  week: WeekInfo
  review: {
    weeks: WeekInfo[]
    start: string
    end: string
    /** « S-1 » ou « S-2 à S-1 » */
    code: string
    /** « Semaine 46 » ou « Semaines 45 et 46 » */
    label: string
    /** « du 9 au 15 novembre 2026 » */
    range: string
    rangeShort: string
  }
  forecast: WeekInfo & { code: string; label: string; range: string; rangeShort: string }
  /** Date de l'état global (début de la période de réalisations). */
  stateDate: string
}

export function weeksLabel(weeks: WeekInfo[]): string {
  if (weeks.length === 1) return `Semaine ${weeks[0].week}`
  const numbers = weeks.map((w) => w.week)
  const last = numbers.pop()
  return `Semaines ${numbers.join(', ')} et ${last}`
}

export function computePeriods(
  meeting: Pick<Meeting, 'isoYear' | 'isoWeek' | 'reviewWeeks' | 'forecastReference'>,
): MeetingPeriods {
  const week = weekInfo(meeting.isoYear, meeting.isoWeek)
  const count = Math.min(4, Math.max(1, meeting.reviewWeeks || 1))
  const weeks: WeekInfo[] = []
  for (let i = count; i >= 1; i--) weeks.push(shiftWeek(week, -i))
  const start = weeks[0].start
  const end = weeks[weeks.length - 1].end
  const forecast = meeting.forecastReference === 'current' ? week : shiftWeek(week, 1)
  return {
    week,
    review: {
      weeks,
      start,
      end,
      code: count === 1 ? 'S-1' : `S-${count} à S-1`,
      label: weeksLabel(weeks),
      range: formatPeriod(start, end),
      rangeShort: formatPeriodShort(start, end),
    },
    forecast: {
      ...forecast,
      code: meeting.forecastReference === 'current' ? 'S' : 'S+1',
      label: `Semaine ${forecast.week}`,
      range: formatPeriod(forecast.start, forecast.end),
      rangeShort: formatPeriodShort(forecast.start, forecast.end),
    },
    stateDate: start,
  }
}

/** « Flash Synchro – Semaine 47 – du 16 au 22 novembre 2026 » */
export function meetingTitle(meeting: Pick<Meeting, 'isoYear' | 'isoWeek' | 'title'>): string {
  if (meeting.title) return meeting.title
  const w = weekInfo(meeting.isoYear, meeting.isoWeek)
  return `Flash Synchro – Semaine ${w.week} – ${formatPeriod(w.start, w.end)}`
}

export function meetingShortTitle(meeting: Pick<Meeting, 'isoWeek' | 'isoYear'>): string {
  return `Semaine ${meeting.isoWeek}`
}

export const SLIDE_KIND_LABELS: Record<SlideKind, string> = {
  overview: 'État global',
  achievements: 'Réalisations',
  forecast: 'Prévisions',
  news: 'Actualités et difficultés',
  custom: 'Diapositive libre',
}

export const SLIDE_KIND_DESCRIPTIONS: Record<SlideKind, string> = {
  overview: 'Indicateurs généraux, chiffres clés et rappel de la situation précédente',
  achievements: 'Travail effectué, résultats, tableaux et graphiques de la période',
  forecast: 'Objectifs, événements programmés, actions prioritaires et échéances',
  news: 'Problèmes rencontrés, points bloquants et besoins d’accompagnement',
  custom: 'Contenu complémentaire (tableau des étoiles, focus, annexe…)',
}

/** Titre automatique d'une diapositive selon son type et la période. */
export function defaultSlideTitle(kind: SlideKind, periods: MeetingPeriods): string {
  switch (kind) {
    case 'overview':
      return 'État global'
    case 'achievements':
      return periods.review.weeks.length === 1
        ? 'Réalisations S-1'
        : `Réalisations des semaines ${periods.review.weeks.map((w) => w.week).join(' et ')}`
    case 'forecast':
      return `Prévisions ${periods.forecast.code}`
    case 'news':
      return 'Actualités et difficultés'
    case 'custom':
      return 'Diapositive complémentaire'
  }
}

/** Sous-titre automatique : la période concernée, recalculée à chaque semaine. */
export function defaultSlideSubtitle(kind: SlideKind, periods: MeetingPeriods): string {
  switch (kind) {
    case 'overview':
      return `Au ${formatLongDate(periods.stateDate)} — rappel de la situation précédente`
    case 'achievements':
    case 'custom':
      return `${periods.review.label} — ${periods.review.range}`
    case 'forecast':
      return `${periods.forecast.label} — ${periods.forecast.range}`
    case 'news':
      return 'Problèmes rencontrés, points bloquants et besoins d’accompagnement'
  }
}

export function resolveSlideTitle(slide: { kind: SlideKind; title: string }, periods: MeetingPeriods): string {
  return slide.title.trim() || defaultSlideTitle(slide.kind, periods)
}

export function resolveSlideSubtitle(slide: { kind: SlideKind; subtitle: string }, periods: MeetingPeriods): string {
  return slide.subtitle.trim() || defaultSlideSubtitle(slide.kind, periods)
}

export const FORECAST_REFERENCE_LABELS: Record<ForecastReference, string> = {
  next: 'Semaine suivant la réunion (S+1)',
  current: 'Semaine de la réunion (S)',
}
