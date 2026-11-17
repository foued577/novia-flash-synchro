import { nowIso, uid } from '@/lib/ids'
import { cloneBlock } from './blocks'
import { dateInWeek, weekInfo, type IsoWeekRef } from './isoWeek'
import type { AppSettings, Meeting, MeetingBundle, Service, Slide, SlideTemplate, Submission } from './types'

// ---------------------------------------------------------------------------
// Création d'une réunion : à partir des modèles ou par duplication
// ---------------------------------------------------------------------------

export interface NewMeetingOptions {
  week: IsoWeekRef
  settings: AppSettings
  services: Service[]
  templates: SlideTemplate[]
  /** Réunion dont on reprend le contenu (duplication). */
  source?: MeetingBundle | null
  reviewWeeks?: number
  meetingDate?: string
  meetingTime?: string
  createdBy?: string | null
}

export function blankSubmission(meetingId: string, serviceId: string): Submission {
  return {
    id: uid(),
    meetingId,
    serviceId,
    status: 'draft',
    comment: '',
    updatedAt: nowIso(),
    updatedBy: null,
    submittedAt: null,
    validatedAt: null,
    validatedBy: null,
  }
}

export function slidesFromTemplates(meetingId: string, serviceId: string, templates: SlideTemplate[]): Slide[] {
  return templates
    .filter((t) => t.serviceId === serviceId)
    .sort((a, b) => a.position - b.position)
    .map((t, index) => ({
      id: uid(),
      meetingId,
      serviceId,
      kind: t.kind,
      title: t.title,
      subtitle: '',
      position: index,
      hidden: false,
      blocks: t.blocks.map((b) => cloneBlock(b)),
      notes: '',
      updatedAt: nowIso(),
    }))
}

export function buildMeetingBundle(opts: NewMeetingOptions): MeetingBundle {
  const { settings, source } = opts
  const week = weekInfo(opts.week.year, opts.week.week)
  const activeServices = opts.services.filter((s) => s.active).sort((a, b) => a.position - b.position)
  const meetingId = uid()
  const stamp = nowIso()

  const participants = activeServices.map((s) => s.id)
  const durations: Record<string, number> = {}
  for (const s of activeServices) durations[s.id] = source?.meeting.durations[s.id] ?? s.durationMinutes

  const meeting: Meeting = {
    id: meetingId,
    isoYear: week.year,
    isoWeek: week.week,
    weekStart: week.start,
    weekEnd: week.end,
    reviewWeeks: opts.reviewWeeks ?? 1,
    forecastReference: settings.forecastReference,
    meetingDate: opts.meetingDate ?? dateInWeek(week, settings.meetingWeekday),
    meetingTime: opts.meetingTime ?? settings.meetingTime,
    status: 'preparation',
    title: null,
    notes: '',
    durations,
    participants,
    duplicatedFrom: source?.meeting.id ?? null,
    timing: null,
    createdAt: stamp,
    updatedAt: stamp,
  }

  const slides: Slide[] = []
  for (const service of activeServices) {
    const sourceSlides = source?.slides.filter((s) => s.serviceId === service.id).sort((a, b) => a.position - b.position) ?? []
    if (sourceSlides.length > 0) {
      sourceSlides.forEach((s, index) =>
        slides.push({
          ...s,
          id: uid(),
          meetingId,
          position: index,
          // Les sous-titres personnalisés sont liés à une période : on revient au calcul automatique.
          subtitle: '',
          blocks: s.blocks.map((b) => cloneBlock(b, { carryKpis: true })),
          updatedAt: stamp,
        }),
      )
    } else {
      slides.push(...slidesFromTemplates(meetingId, service.id, opts.templates))
    }
  }

  return {
    meeting,
    submissions: activeServices.map((s) => blankSubmission(meetingId, s.id)),
    slides,
    attachments: [],
  }
}
