import { useMemo } from 'react'
import { buildDeck } from '@/domain/deck'
import { dateInWeek, shiftWeek } from '@/domain/isoWeek'
import { computePeriods } from '@/domain/periods'
import { findMeetingForWeek } from '@/domain/selectors'
import type { MeetingBundle, Snapshot } from '@/domain/types'
import { useAppStore } from '@/store/useAppStore'
import type { DeckRenderData } from './context'

export function buildDeckRenderData(snapshot: Snapshot | null, bundle: MeetingBundle | undefined | null): DeckRenderData | null {
  if (!snapshot || !bundle) return null
  const meeting = bundle.meeting
  const deck = buildDeck(meeting, snapshot.services, bundle.slides, snapshot.settings)
  const nextWeek = shiftWeek({ year: meeting.isoYear, week: meeting.isoWeek }, 1)
  const existing = findMeetingForWeek(snapshot.meetings, nextWeek)
  return {
    meeting,
    periods: computePeriods(meeting),
    services: deck.services,
    slides: bundle.slides,
    submissions: bundle.submissions,
    users: snapshot.users,
    settings: snapshot.settings,
    deck,
    nextMeeting: {
      date: existing?.meetingDate ?? dateInWeek(nextWeek, snapshot.settings.meetingWeekday),
      time: existing?.meetingTime ?? snapshot.settings.meetingTime,
      week: nextWeek.week,
    },
  }
}

/** Données de rendu d'une réunion chargée, recalculées à chaque modification. */
export function useDeckData(meetingId: string | undefined): DeckRenderData | null {
  const snapshot = useAppStore((s) => s.snapshot)
  const bundle = useAppStore((s) => (meetingId ? s.bundles[meetingId] : undefined))
  return useMemo(() => buildDeckRenderData(snapshot, bundle), [snapshot, bundle])
}
