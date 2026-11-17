import { blockHasContent } from './blocks'
import { compareWeeks, nextMeetingDate, sameWeek, weekOf, type IsoWeekRef } from './isoWeek'
import type { AppSettings, Meeting, MeetingBundle, Service, SubmissionStatus } from './types'

// ---------------------------------------------------------------------------
// Sélecteurs purs utilisés par le tableau de bord, l'historique et les espaces.
// ---------------------------------------------------------------------------

export const sortMeetingsDesc = (meetings: Meeting[]) =>
  [...meetings].sort((a, b) => compareWeeks({ year: b.isoYear, week: b.isoWeek }, { year: a.isoYear, week: a.isoWeek }))

export const meetingRef = (m: Pick<Meeting, 'isoYear' | 'isoWeek'>): IsoWeekRef => ({ year: m.isoYear, week: m.isoWeek })

export function findMeetingForWeek(meetings: Meeting[], ref: IsoWeekRef): Meeting | undefined {
  return meetings.find((m) => sameWeek(meetingRef(m), ref))
}

/** Semaine de la prochaine réunion d'après le jour et l'heure configurés. */
export function targetMeetingWeek(settings: AppSettings, today: string, nowTime: string) {
  return weekOf(nextMeetingDate(today, settings.meetingWeekday, settings.meetingTime, nowTime))
}

/**
 * Réunion « en cours » : celle de la semaine de la prochaine réunion,
 * à défaut la prochaine en préparation, à défaut la plus récente.
 */
export function currentMeeting(meetings: Meeting[], settings: AppSettings, today: string, nowTime: string): Meeting | null {
  if (meetings.length === 0) return null
  const target = findMeetingForWeek(meetings, targetMeetingWeek(settings, today, nowTime))
  if (target) return target
  const upcoming = meetings
    .filter((m) => (m.status === 'preparation' || m.status === 'ready') && m.meetingDate >= today)
    .sort((a, b) => a.meetingDate.localeCompare(b.meetingDate))
  if (upcoming[0]) return upcoming[0]
  const thisWeek = findMeetingForWeek(meetings, weekOf(today))
  return thisWeek ?? sortMeetingsDesc(meetings)[0] ?? null
}

export interface Completion {
  total: number
  counts: Record<SubmissionStatus, number>
  /** Soumis + validés. */
  done: number
  rate: number
  pending: string[]
}

export function completion(bundle: MeetingBundle | undefined, participants: string[]): Completion {
  const counts: Record<SubmissionStatus, number> = { draft: 0, in_progress: 0, submitted: 0, validated: 0 }
  const pending: string[] = []
  for (const serviceId of participants) {
    const status = bundle?.submissions.find((s) => s.serviceId === serviceId)?.status ?? 'draft'
    counts[status] += 1
    if (status === 'draft' || status === 'in_progress') pending.push(serviceId)
  }
  const done = counts.submitted + counts.validated
  return { total: participants.length, counts, done, rate: participants.length ? done / participants.length : 0, pending }
}

export function submissionStatus(bundle: MeetingBundle | undefined, serviceId: string): SubmissionStatus {
  return bundle?.submissions.find((s) => s.serviceId === serviceId)?.status ?? 'draft'
}

/** Diapositives visibles et diapositives renseignées d'un service. */
export function serviceFill(bundle: MeetingBundle | undefined, serviceId: string) {
  const slides = (bundle?.slides ?? []).filter((s) => s.serviceId === serviceId && !s.hidden)
  const filled = slides.filter((s) => s.blocks.some(blockHasContent)).length
  return { total: slides.length, filled }
}

export function servicesById(services: Service[]) {
  return new Map(services.map((s) => [s.id, s]))
}

/** Date limite de saisie (YYYY-MM-DD + heure). */
export function submissionDeadline(meeting: Meeting, settings: AppSettings) {
  const d = new Date(`${meeting.meetingDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - settings.submissionDeadlineDaysBefore)
  return { date: d.toISOString().slice(0, 10), time: settings.submissionDeadlineTime }
}

/**
 * Historique d'un indicateur : recherche, réunion par réunion, la valeur du
 * libellé donné dans les blocs d'indicateurs d'un service.
 */
export function kpiHistory(bundles: MeetingBundle[], serviceId: string, label: string) {
  return bundles
    .map((b) => {
      for (const slide of b.slides.filter((s) => s.serviceId === serviceId).sort((x, y) => y.position - x.position)) {
        for (const block of slide.blocks) {
          if (block.type !== 'kpis') continue
          const item = block.items.find((i) => i.label.trim().toLowerCase() === label.trim().toLowerCase())
          if (item && item.value.trim() !== '') return { meeting: b.meeting, value: item.value }
        }
      }
      return null
    })
    .filter((x): x is { meeting: Meeting; value: string } => x !== null)
}
