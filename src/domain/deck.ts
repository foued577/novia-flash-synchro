import type { AppSettings, Meeting, Service, Slide } from './types'

// ---------------------------------------------------------------------------
// Génération du déroulé de la présentation à partir des données saisies :
// couverture → ordre du jour → [ouverture de section → diapositives] × services → clôture
// ---------------------------------------------------------------------------

export type DeckEntry =
  | { key: string; type: 'cover' }
  | { key: string; type: 'agenda' }
  | { key: string; type: 'section'; serviceId: string }
  | { key: string; type: 'service'; serviceId: string; slideId: string }
  | { key: string; type: 'closing' }

export interface Deck {
  entries: DeckEntry[]
  /** Services présentés, dans l'ordre. */
  services: Service[]
  /** Première et dernière position de chaque service dans le déroulé. */
  ranges: Record<string, { first: number; last: number }>
}

export function participatingServices(meeting: Meeting, services: Service[]): Service[] {
  const byId = new Map(services.map((s) => [s.id, s]))
  return meeting.participants.map((id) => byId.get(id)).filter((s): s is Service => !!s)
}

export function buildDeck(meeting: Meeting, services: Service[], slides: Slide[], settings: Pick<AppSettings, 'showSectionSlides'>): Deck {
  const ordered = participatingServices(meeting, services)
  const entries: DeckEntry[] = [
    { key: 'cover', type: 'cover' },
    { key: 'agenda', type: 'agenda' },
  ]
  const ranges: Deck['ranges'] = {}

  for (const service of ordered) {
    const first = entries.length
    if (settings.showSectionSlides) entries.push({ key: `section-${service.id}`, type: 'section', serviceId: service.id })
    slides
      .filter((s) => s.serviceId === service.id && !s.hidden)
      .sort((a, b) => a.position - b.position)
      .forEach((s) => entries.push({ key: s.id, type: 'service', serviceId: service.id, slideId: s.id }))
    if (entries.length === first) {
      // Service sans diapositive visible : on garde une ouverture pour le chronomètre.
      entries.push({ key: `section-${service.id}`, type: 'section', serviceId: service.id })
    }
    ranges[service.id] = { first, last: entries.length - 1 }
  }

  entries.push({ key: 'closing', type: 'closing' })
  return { entries, services: ordered, ranges }
}

export function serviceAt(deck: Deck, index: number): string | null {
  const entry = deck.entries[index]
  if (!entry) return null
  return entry.type === 'section' || entry.type === 'service' ? entry.serviceId : null
}

/** Durée totale prévue (minutes) pour les services participants. */
export function plannedMinutes(meeting: Meeting): number {
  return meeting.participants.reduce((sum, id) => sum + (meeting.durations[id] ?? 0), 0)
}
