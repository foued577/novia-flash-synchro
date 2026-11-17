import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, defaultServices, defaultTemplates, SERVICE_IDS } from '@/data/catalog'
import { generateDemoData } from '@/data/demoSeed'
import { blockHasContent, computeTotalRow, parseTabular } from './blocks'
import { buildDeck, plannedMinutes, serviceAt } from './deck'
import { buildMeetingBundle } from './meetingFactory'
import { canEditService, canSubmit, canValidate, canWithdraw } from './permissions'
import { completion, currentMeeting, kpiHistory } from './selectors'
import type { AppUser } from './types'

const services = defaultServices()
const templates = defaultTemplates()

describe('Création et duplication des réunions', () => {
  it('crée une réunion à partir des modèles avec les durées de la présentation historique', () => {
    const bundle = buildMeetingBundle({ week: { year: 2026, week: 47 }, settings: DEFAULT_SETTINGS, services, templates })
    expect(bundle.meeting.weekStart).toBe('2026-11-16')
    expect(bundle.meeting.meetingDate).toBe('2026-11-19') // jeudi par défaut
    expect(plannedMinutes(bundle.meeting)).toBe(25) // 6 + 7 + 6 + 3 + 3
    expect(bundle.submissions.every((s) => s.status === 'draft')).toBe(true)
    // 4 diapositives par service + le « Tableau des étoiles » du commercial
    expect(bundle.slides.filter((s) => s.serviceId === SERVICE_IDS.commercial)).toHaveLength(5)
    expect(bundle.slides.filter((s) => s.serviceId === SERVICE_IDS.pedagogie).map((s) => s.kind)).toEqual(['overview', 'achievements', 'forecast', 'news'])
  })

  it('duplique une réunion : nouveaux identifiants, statuts remis à zéro, chiffres reportés en rappel', () => {
    const demo = generateDemoData('2026-11-17', '14:16')
    const source = Object.values(demo.bundles).find((b) => b.meeting.isoWeek === 47)!
    const copy = buildMeetingBundle({ week: { year: 2026, week: 48 }, settings: DEFAULT_SETTINGS, services, templates, source })
    expect(copy.meeting.duplicatedFrom).toBe(source.meeting.id)
    expect(copy.slides).toHaveLength(source.slides.length)
    expect(copy.slides.some((s) => source.slides.some((o) => o.id === s.id))).toBe(false)
    expect(copy.submissions.every((s) => s.status === 'draft')).toBe(true)
    const kpiSource = source.slides.flatMap((s) => s.blocks).find((b) => b.type === 'kpis')!
    const kpiCopy = copy.slides.flatMap((s) => s.blocks).find((b) => b.type === 'kpis')!
    if (kpiSource.type !== 'kpis' || kpiCopy.type !== 'kpis') throw new Error('bloc attendu')
    expect(kpiCopy.items[0].previous).toBe(kpiSource.items[0].value)
  })
})

describe('Jeu de démonstration', () => {
  const demo = generateDemoData('2026-11-17', '14:16')

  it('place la réunion en cours en semaine 47 et reproduit la période de deux semaines du PDF', () => {
    const current = currentMeeting(demo.snapshot.meetings, demo.snapshot.settings, '2026-11-17', '14:16')!
    expect(current.isoWeek).toBe(47)
    expect(current.status).toBe('preparation')
    const twoWeeks = demo.snapshot.meetings.find((m) => m.reviewWeeks === 2)!
    expect(twoWeeks.isoWeek).toBe(44)
  })

  it('présente des statuts de saisie variés et un taux de complétion de 60 %', () => {
    const current = currentMeeting(demo.snapshot.meetings, demo.snapshot.settings, '2026-11-17', '14:16')!
    const c = completion(demo.bundles[current.id], current.participants)
    expect(c.rate).toBeCloseTo(0.6)
    expect(c.pending).toEqual([SERVICE_IDS.administratif, SERVICE_IDS.vieScolaire])
  })

  it('suit les indicateurs semaine après semaine (contrats 26/27 : 43 → 100, comme dans le PDF)', () => {
    const ordered = [...demo.snapshot.meetings].sort((a, b) => a.weekStart.localeCompare(b.weekStart)).map((m) => demo.bundles[m.id])
    const history = kpiHistory(ordered, SERVICE_IDS.commercial, 'Total contrats 26/27').map((h) => h.value)
    expect(history).toContain('100')
    expect(history.at(-1)).toBe('128')
  })
})

describe('Génération du déroulé', () => {
  const demo = generateDemoData('2026-11-17', '14:16')
  const current = currentMeeting(demo.snapshot.meetings, demo.snapshot.settings, '2026-11-17', '14:16')!
  const bundle = demo.bundles[current.id]

  it('enchaîne couverture, ordre du jour, sections de services et clôture', () => {
    const deck = buildDeck(current, services, bundle.slides, { showSectionSlides: true })
    expect(deck.entries[0].type).toBe('cover')
    expect(deck.entries[1].type).toBe('agenda')
    expect(deck.entries.at(-1)?.type).toBe('closing')
    expect(deck.entries).toHaveLength(2 + 5 + bundle.slides.length + 1)
    expect(serviceAt(deck, deck.ranges[SERVICE_IDS.commercial].first)).toBe(SERVICE_IDS.commercial)
  })

  it('exclut les diapositives masquées et respecte l’ordre de passage', () => {
    const slides = bundle.slides.map((s, i) => (i === 0 ? { ...s, hidden: true } : s))
    const reordered = { ...current, participants: [...current.participants].reverse() }
    const deck = buildDeck(reordered, services, slides, { showSectionSlides: false })
    expect(deck.entries).toHaveLength(2 + bundle.slides.length - 1 + 1)
    expect(deck.services[0].id).toBe(SERVICE_IDS.communication)
  })
})

describe('Blocs et droits', () => {
  it('calcule la ligne de total et importe un collage Excel', () => {
    expect(computeTotalRow({ columns: ['Agent', 'Signés'], rows: [['A', '3'], ['B', '41']] })).toEqual(['Total', '44'])
    expect(parseTabular('Agent\tSignés\nA\t3\nB\t4')).toEqual({ columns: ['Agent', 'Signés'], rows: [['A', '3'], ['B', '4']] })
    expect(blockHasContent({ id: '1', type: 'text', title: '', width: 'auto', text: '  ', tone: 'neutral' })).toBe(false)
  })

  it('applique le circuit Brouillon → En cours → Soumis → Validé', () => {
    const manager: AppUser = { id: 'm', fullName: 'M', email: '', role: 'manager', serviceId: SERVICE_IDS.commercial, jobTitle: '' }
    const admin: AppUser = { ...manager, id: 'a', role: 'admin', serviceId: null }
    const viewer: AppUser = { ...manager, id: 'v', role: 'viewer', serviceId: null }
    expect(canEditService(manager, SERVICE_IDS.commercial, 'in_progress')).toBe(true)
    expect(canEditService(manager, SERVICE_IDS.pedagogie, 'in_progress')).toBe(false)
    expect(canEditService(manager, SERVICE_IDS.commercial, 'submitted')).toBe(false)
    expect(canWithdraw(manager, SERVICE_IDS.commercial, 'submitted')).toBe(true)
    expect(canSubmit(viewer, SERVICE_IDS.commercial, 'draft')).toBe(false)
    expect(canValidate(manager, 'submitted')).toBe(false)
    expect(canValidate(admin, 'submitted')).toBe(true)
    expect(canEditService(admin, SERVICE_IDS.commercial, 'validated')).toBe(true)
  })
})
