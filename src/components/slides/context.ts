import { createContext, useContext } from 'react'
import type { Deck } from '@/domain/deck'
import type { MeetingPeriods } from '@/domain/periods'
import type { AppSettings, AppUser, Meeting, Service, Slide, Submission } from '@/domain/types'

/** Dimensions logiques d'une diapositive (affichage 16:9 Full HD). */
export const SLIDE_W = 1920
export const SLIDE_H = 1080

export type RenderMode = 'present' | 'preview' | 'thumb' | 'export'

/** Tout ce qu'il faut pour générer les diapositives d'une réunion. */
export interface DeckRenderData {
  meeting: Meeting
  periods: MeetingPeriods
  /** Services participants, dans l'ordre de passage. */
  services: Service[]
  slides: Slide[]
  submissions: Submission[]
  users: AppUser[]
  settings: AppSettings
  deck: Deck
  nextMeeting: { date: string; time: string; week: number } | null
}

export const RenderModeContext = createContext<RenderMode>('preview')
export const useRenderMode = () => useContext(RenderModeContext)
/** Les animations ne jouent qu'en présentation. */
export const useAnimate = () => useContext(RenderModeContext) === 'present'
