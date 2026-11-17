import { useEffect, useMemo } from 'react'
import { currentMeeting, sortMeetingsDesc } from '@/domain/selectors'
import type { Meeting, MeetingBundle } from '@/domain/types'
import { useAppStore } from './useAppStore'

/** Réunion de la semaine (ou prochaine réunion). */
export function useCurrentMeeting(): Meeting | null {
  const snapshot = useAppStore((s) => s.snapshot)
  const today = useAppStore((s) => s.today)
  const nowTime = useAppStore((s) => s.nowTime)
  return useMemo(() => (snapshot ? currentMeeting(snapshot.meetings, snapshot.settings, today, nowTime) : null), [snapshot, today, nowTime])
}

export function useSortedMeetings(): Meeting[] {
  const meetings = useAppStore((s) => s.snapshot?.meetings)
  return useMemo(() => sortMeetingsDesc(meetings ?? []), [meetings])
}

/** Charge (si besoin) et renvoie le contenu d'une réunion. */
export function useBundle(meetingId: string | undefined): MeetingBundle | undefined {
  const bundle = useAppStore((s) => (meetingId ? s.bundles[meetingId] : undefined))
  const loadBundle = useAppStore((s) => s.loadBundle)
  useEffect(() => {
    if (meetingId && !bundle) void loadBundle(meetingId)
  }, [meetingId, bundle, loadBundle])
  return bundle
}

export function useServices() {
  const services = useAppStore((s) => s.snapshot?.services)
  return useMemo(() => [...(services ?? [])].sort((a, b) => a.position - b.position), [services])
}
