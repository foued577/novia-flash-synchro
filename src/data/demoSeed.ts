import { cloneBlock } from '@/domain/blocks'
import { addDays, dateInWeek, nextMeetingDate, nowTimeInParis, shiftWeek, todayInParis, weekOf, type WeekInfo } from '@/domain/isoWeek'
import { blankSubmission } from '@/domain/meetingFactory'
import { computePeriods, type MeetingPeriods } from '@/domain/periods'
import type { Block, ChartBlock, ImageBlock, Meeting, MeetingBundle, Slide, SlideKind, Snapshot, SubmissionStatus, TextBlock } from '@/domain/types'
import { formatLongDate, formatPeriod } from '@/lib/format'
import { uid } from '@/lib/ids'
import { DEFAULT_SETTINGS, SERVICE_IDS, USER_IDS, defaultServices, defaultTemplates, defaultUsers, events, issues, kpis, list, table } from './catalog'

// ---------------------------------------------------------------------------
// Jeu de démonstration réaliste, inspiré de la Flash Synchro des semaines 42 & 43.
// Il est généré relativement à la date du jour : la réunion « en cours » est
// toujours celle de la semaine à venir, avec 6 réunions archivées avant elle.
// Les noms des personnes sont fictifs.
// ---------------------------------------------------------------------------

export interface DemoData {
  snapshot: Snapshot
  bundles: Record<string, MeetingBundle>
}

/** Planning : décalage en semaines par rapport à la réunion courante (pas de réunion pendant les vacances). */
const PLAN = [
  { offset: -8, reviewWeeks: 1 },
  { offset: -7, reviewWeeks: 1 },
  { offset: -6, reviewWeeks: 1 },
  { offset: -3, reviewWeeks: 2 },
  { offset: -2, reviewWeeks: 1 },
  { offset: -1, reviewWeeks: 1 },
  { offset: 0, reviewWeeks: 1 },
] as const
const LAST = PLAN.length - 1

const AGENTS = ['Yanis Belkacem', 'Sarah Benhamou', 'Léa Martin', 'Hugo Dubois', 'Amina Kaddour', 'Mehdi Saïdi', 'Clara Petit', 'Rayan Aït-Ali', 'Manon Garcia', 'Ilyes Brahimi', 'Chloé Laurent']

/** Générateur pseudo-aléatoire déterministe (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Ctx {
  k: number
  meetingId: string
  periods: MeetingPeriods
  rand: () => number
  /** Lundi de la semaine de prévision. */
  f: (dayOffset: number) => string
}

const pick = <T,>(values: readonly T[], k: number): T => values[Math.min(k, values.length - 1)]

function makeSlide(ctx: Ctx, serviceId: string, kind: SlideKind, position: number, blocks: Block[], title = ''): Slide {
  return {
    id: uid(),
    meetingId: ctx.meetingId,
    serviceId,
    kind,
    title,
    subtitle: '',
    position,
    hidden: false,
    blocks,
    notes: '',
    updatedAt: new Date().toISOString(),
  }
}

function chart(title: string, chartType: ChartBlock['chartType'], categories: string[], series: [string, number[], string?][], opts: { unit?: string; width?: Block['width']; showValues?: boolean } = {}): ChartBlock {
  return {
    id: uid(),
    type: 'chart',
    title,
    width: opts.width ?? 'auto',
    chartType,
    categories,
    series: series.map(([name, values, color]) => ({ id: uid(), name, values, color: color ?? null })),
    unit: opts.unit ?? '',
    showValues: opts.showValues ?? true,
  }
}

const text = (body: string, tone: TextBlock['tone'] = 'neutral', title = ''): TextBlock => ({ id: uid(), type: 'text', title, width: 'auto', text: body, tone })

// ---------------------------------------------------------------------------
// Service pédagogique
// ---------------------------------------------------------------------------
function pedagogie(ctx: Ctx): Slide[] {
  const { k } = ctx
  const S = SERVICE_IDS.pedagogie
  const learners = [418, 421, 425, 431, 433, 436, 438]
  const classes = [27, 27, 27, 26, 26, 26, 25]
  const presence = [91, 90, 92, 88, 89, 90, 91]
  const bulletins = ['4 / 21', '7 / 21', '9 / 21', '12 / 21', '15 / 21', '18 / 21', '19 / 21']
  const prev = (arr: number[]) => (k > 0 ? arr[k - 1] : arr[0] - 3)

  const pdfMeeting = k === 3
  const achievements: Block[] = pdfMeeting
    ? [
        list('Examens DREETS', [
          ['Sessions NTC, BIMOD, TEBDP et MUM 1 et 2 validées', 'done'],
          ['Envoi des attestations d’inscription à l’examen final DREETS (formations RD)', 'done'],
          ['Retours reçus : 6 NTC RD et 8 CV RD', 'done'],
          ['Examens REM et CV : résultats en attente', 'ongoing'],
        ]),
        table('Résultats des examens DREETS', ['Résultat', 'NTC', 'BIMOD', 'TEBDP', 'MUM'], [
          ['Inscrits', 9, 3, 2, 16],
          ['Réussite', 4, 1, 1, 13],
          ['Réussite partielle', 2, 0, 1, 0],
          ['Échec', 0, 1, 0, 0],
          ['Absents', 3, 1, 0, 3],
        ]),
        chart('Taux de réussite par examen', 'bar', ['NTC', 'BIMOD', 'TEBDP', 'MUM'], [['Taux de réussite', [44.4, 33.3, 50, 81.3]]], { unit: '%' }),
      ]
    : [
        list('Travail réalisé', [
          [pick(['Lancement des cours du 2e module MCM 1', 'Évaluations intermédiaires NTC RD', 'Préparation des jurys DREETS', '', 'Saisie des notes du 1er semestre', 'Examens internes finaux MCM 1', 'Correction et délibération des examens internes MCM 1'], k), 'done'],
          [pick(['Planification des examens d’octobre', 'Visites en entreprise (12 apprenants)', 'Conseils pédagogiques CV RD', '', 'Relance des formateurs pour les bulletins', 'Publication des bulletins (18 formations sur 21)', 'Publication des bulletins : 19 formations sur 21'], k), 'done'],
          ['Retours DREETS : 6 NTC RD et 8 CV RD', k >= 4 ? 'done' : 'ongoing'],
          [pick(['Mise à jour des livrets d’apprentissage', 'Mise à jour des livrets d’apprentissage', 'Réunion formateurs IA 2', '', 'Préparation des oraux IA 2', 'Préparation des oraux IA 2', 'Convocations envoyées pour les oraux IA 2'], k), k === LAST ? 'done' : 'ongoing'],
        ]),
        table('Examens internes finaux', ['Résultat', 'MCM 1', 'NTC RD', 'CV RD'], [
          ['Inscrits', 23, 16, 28],
          ['Réussite', 17 - (LAST - k), 11, 19],
          ['Réussite partielle', 3, 2, 4],
          ['Échec', 1 + (LAST - k > 2 ? 1 : 0), 1, 2],
          ['Absents', 2, 2, 3],
        ]),
        chart('Résultats par formation', 'stacked', ['MCM 1', 'NTC RD', 'CV RD'], [
          ['Réussite', [17 - (LAST - k), 11, 19], '#0CA30C'],
          ['Réussite partielle', [3, 2, 4], '#FAB219'],
          ['Échec', [1 + (LAST - k > 2 ? 1 : 0), 1, 2], '#D03B3B'],
          ['Absents', [2, 2, 3], '#A3ACB9'],
        ], { showValues: false }),
      ]

  return [
    makeSlide(ctx, S, 'overview', 0, [
      kpis('Chiffres clés', [
        ['Apprenants en formation', learners[k], prev(learners)],
        ['Classes actives', classes[k], prev(classes), { goodWhen: 'neutral' }],
        ['Taux de présence', presence[k], prev(presence), { unit: '%' }],
        ['Bulletins publiés', bulletins[k], '', { goodWhen: 'neutral' }],
      ]),
      list('Rappel de la semaine précédente', [
        'Les sessions NTC, BIMOD, TEBDP et MUM ont toutes été validées',
        'Bulletins publiés : les formations concernées ont été informées par mail',
        k >= 3 ? 'Classe MCO 2 : suppression à confirmer' : 'Ouverture du groupe CV RP 26/27 Groupe B',
      ]),
    ]),
    makeSlide(ctx, S, 'achievements', 1, achievements),
    makeSlide(ctx, S, 'forecast', 2, [
      events('Examens et événements', [
        [ctx.f(0), 'IA 2 — oraux avec le certificateur', 'Salle 4, convocations envoyées', ctx.f(1)],
        [ctx.f(2), 'Jury de délibération MCM 1', 'Examens internes finaux', '', '14:00'],
        [ctx.f(3), 'MCM 2 — oraux', 'En attente de la date du certificateur'],
        [ctx.f(4), 'Conseil de classe CV RD', '', '', '16:30'],
      ]),
      list('Actions prioritaires', [
        ['Relancer le certificateur pour fixer les oraux MCM 2', 'todo'],
        ['Compléter les bulletins des formations restantes', 'ongoing'],
        ['Préparer le planning des examens de décembre', 'todo'],
      ]),
    ]),
    makeSlide(ctx, S, 'news', 3, [
      issues('Actualités et difficultés', [
        ['Classe MCO 2 à supprimer', 'attention', 'Effectif insuffisant pour maintenir l’ouverture du groupe', 'Validation par la direction'],
        ['MCO 1 : décision finale la semaine prochaine', 'info', 'Maintien du groupe à confirmer selon les inscriptions'],
        ['Certificateur MCM 2 non confirmé', 'blocking', 'Les oraux ne peuvent pas être planifiés', 'Relance de l’organisme certificateur par la direction'],
      ]),
    ]),
  ]
}

// ---------------------------------------------------------------------------
// Service commercial
// ---------------------------------------------------------------------------
function commercial(ctx: Ctx): Slide[] {
  const { k, rand } = ctx
  const S = SERVICE_IDS.commercial
  const contracts = [21, 29, 36, 100, 109, 117, 128]
  const contractsPrev = [14, 21, 29, 43, 100, 109, 117]
  const accords = [7, 11, 15, 47, 52, 56, 61]
  const accordsPrev = [4, 7, 11, 18, 47, 52, 56]
  const followUp = [244, 247, 250, 258, 261, 263, 266]
  const followUpPrev = [241, 244, 247, 252, 258, 261, 263]
  const accords2526 = [301, 302, 303, 305, 305, 305, 305]

  const baseSigned = [3, 1, 5, 5, 2, 8, 4, 6, 4, 2, 1]
  const baseOngoing = [1, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0]
  const signed = baseSigned.map((v) => (k === LAST ? v : Math.max(0, Math.round(v * (0.5 + rand() * 0.7)))))
  const ongoing = baseOngoing.map((v) => (k === LAST ? v : Math.round(rand() * 1.4)))
  const agentRows = AGENTS.map((name, i) => [name, ongoing[i] || '', signed[i], ongoing[i] + signed[i]])
  const monthStart = `${ctx.periods.review.end.slice(0, 8)}01`
  const caption = `Période ${formatPeriod(monthStart < ctx.periods.review.start ? monthStart : ctx.periods.review.start, ctx.periods.review.end)}`

  const stars = k === LAST ? [2, 1, 0, 5, 3, 1, 1, 0, 0, 1, 0] : AGENTS.map(() => Math.floor(rand() * 4))
  const starRows = AGENTS.map((name, i) => [name, stars[i]]).filter((r) => Number(r[1]) > 0 || k === LAST)

  return [
    makeSlide(ctx, S, 'overview', 0, [
      kpis('Situation des contrats', [
        ['Total contrats 25/26', 341, 341],
        ['Accords 25/26', accords2526[k], k > 0 ? accords2526[k - 1] : 300],
        ['Total contrats 26/27', contractsPrev[k], k > 0 ? contractsPrev[k - 1] : 9],
        ['Accords 26/27', accordsPrev[k], k > 0 ? accordsPrev[k - 1] : 2],
        ['Suivi apprenants', followUpPrev[k], k > 0 ? followUpPrev[k - 1] : 238],
      ]),
    ]),
    makeSlide(ctx, S, 'achievements', 1, [
      kpis('Contrats et suivis', [
        ['Total contrats 26/27', contracts[k], contractsPrev[k]],
        ['Accords 26/27', accords[k], accordsPrev[k]],
        ['Suivi apprenants', followUp[k], followUpPrev[k]],
      ]),
      table('Contrats par chargé(e) de relations entreprises', ['Chargé(e)', 'En cours de signature', 'Signés', 'Total'], agentRows, { totalRow: true, caption }),
      chart('Contrats signés et en cours', 'horizontal', AGENTS.map((a) => a.split(' ')[0]), [
        ['Signés', signed, '#3E7CC4'],
        ['En cours de signature', ongoing, '#9DBEE6'],
      ], { showValues: false }),
    ]),
    makeSlide(ctx, S, 'custom', 2, [
      table('Nombre d’étoiles par chargé(e)', ['Chargé(e)', 'Étoiles'], starRows, { totalRow: true }),
      chart('Classement de la période', 'horizontal', starRows.map((r) => String(r[0]).split(' ')[0]), [['Étoiles', starRows.map((r) => Number(r[1]))]]),
    ], 'Tableau des étoiles'),
    makeSlide(ctx, S, 'forecast', 3, [
      kpis('Objectifs de la semaine', [
        ['Nouveaux contrats visés', 10, '', { goodWhen: 'neutral' }],
        ['Rendez-vous entreprises planifiés', 14, '', { goodWhen: 'neutral' }],
        ['Contrats à finaliser', ongoing.reduce((a, b) => a + b, 0), '', { goodWhen: 'neutral' }],
      ]),
      events('Événements programmés', [
        [ctx.f(0), 'Relance des contrats en cours de signature', 'Point quotidien avec chaque chargé(e)'],
        [ctx.f(2), 'Job dating alternance — campus NOVIA', '40 entreprises invitées, 120 candidats attendus', '', '13:30'],
        [ctx.f(3), 'Comité commercial mensuel', '', '', '09:00'],
      ]),
    ]),
    makeSlide(ctx, S, 'news', 4, [
      issues('Actualités et difficultés', [
        ['Délais de traitement OPCO allongés', 'attention', 'Certaines prises en charge dépassent 3 semaines', 'Point avec le service administratif'],
        ['2 entreprises en attente de validation d’éligibilité', 'info', 'Dossiers transmis, réponse attendue cette semaine'],
        ['Supports de communication pour le job dating', 'attention', 'Affiches et publications à finaliser', 'Appui du service communication'],
      ]),
    ]),
  ]
}

// ---------------------------------------------------------------------------
// Service administratif
// ---------------------------------------------------------------------------
function administratif(ctx: Ctx, status: SubmissionStatus): Slide[] {
  const { k } = ctx
  const S = SERVICE_IDS.administratif
  const dropouts = [9, 10, 11, 14, 14, 15, 15]
  const complete = [198, 205, 212, 228, 231, 233, 236]
  const pending = [31, 28, 26, 21, 19, 16, 13]
  const prev = (arr: number[]) => (k > 0 ? arr[k - 1] : arr[0])
  const partial = status === 'in_progress'

  return [
    makeSlide(ctx, S, 'overview', 0, [
      kpis('Chiffres clés', [
        ['Abandons officiels', dropouts[k], prev(dropouts), { goodWhen: 'down' }],
        ['Dossiers complets', complete[k], prev(complete), { target: 266 }],
        ['Conventions en attente', pending[k], prev(pending), { goodWhen: 'down' }],
      ]),
      text(`${dropouts[k]} abandons officiels sur le listing — mise à jour en cours`, 'warning'),
    ]),
    makeSlide(ctx, S, 'achievements', 1, [
      list('Contrats et suivis', [
        ['Mise à jour du listing des abandons', 'done'],
        [`Dépôt de ${[14, 17, 12, 31, 18, 20, 24][k]} contrats sur les plateformes OPCO`, 'done'],
        ['Relance de 12 dossiers incomplets', 'done'],
        ['Contrôle des conventions de formation 26/27', 'ongoing'],
      ]),
      chart('Contrats déposés par OPCO', 'bar', ['Akto', 'OPCO EP', 'Atlas', 'Opco 2i', 'Constructys'], [['Contrats déposés', [9, 6, 4, 3, 2].map((v) => v + (k % 3) - 1)]]),
    ]),
    makeSlide(ctx, S, 'forecast', 2, [
      list('Prévisions', [
        ['Clôture du listing des abandons', 'todo'],
        ['Facturation OPCO du mois', 'todo'],
        ...(partial ? [] : ([['Envoi des attestations de présence', 'todo']] as [string, 'todo'][])),
      ]),
      events('Échéances', partial ? [[ctx.f(4), 'Date limite de facturation OPCO']] : [[ctx.f(1), 'Envoi des attestations de présence'], [ctx.f(4), 'Date limite de facturation OPCO']]),
    ]),
    makeSlide(ctx, S, 'news', 3, [
      issues('Actualités et difficultés', partial ? [] : [['Retards de prise en charge OPCO sur 6 dossiers', 'attention', 'Relances effectuées sans réponse', 'Point avec la direction financière']]),
    ]),
  ]
}

// ---------------------------------------------------------------------------
// Vie scolaire
// ---------------------------------------------------------------------------
const GROUPS: [string, string, number, number][] = [
  ['NOVIA 34 NTC RD 26', 'Négociateur technico-commercial', 16, 16],
  ['NOVIA 34 CV RD 26', 'TP Conseiller de vente', 28, 54],
  ['NOVIA 34 CV RP 26/27 – Groupe A', 'TP Conseiller de vente', 30, 55],
  ['NOVIA 34 CV RP 26/27 – Groupe B', 'TP Conseiller de vente', 19, 36],
  ['NOVIA 34 CV RP 26/27 – NELLAPP', 'TP Conseiller de vente', 2, 4],
  ['NOVIA 34 BACH MC 2025', 'Bachelor Marketing et communication', 3, 6],
  ['ADG 34 MCM 1 RP 25/26', 'Manager commercial et marketing', 1, 3],
  ['NOVIA 34 MCM 1 RP 26/27', 'Manager commercial et marketing', 23, 73],
  ['NOVIA 34 COBIM RP 26/27', 'Coordinateur BIM du bâtiment', 3, 14],
  ['ADG 34 MBA SD 2026', 'MBA Stratégie digitale', 4, 7],
]

function vieScolaire(ctx: Ctx): Slide[] {
  const { k, rand } = ctx
  const S = SERVICE_IDS.vieScolaire
  const absences = GROUPS.map(([, , , abs]) => Math.max(1, Math.round(abs * (k === LAST - 1 ? 1 : 0.6 + rand() * 0.6))))
  const total = absences.reduce((a, b) => a + b, 0)
  const sorted = GROUPS.map((g, i) => ({ label: g[0].replace(/^(NOVIA|ADG) 34 /, ''), value: absences[i] })).sort((a, b) => b.value - a.value)
  const councils = [1, 2, 2, 4, 1, 1, 2]
  const warnings = [2, 3, 1, 3, 2, 4, 3]

  return [
    makeSlide(ctx, S, 'overview', 0, [
      kpis('Chiffres clés', [
        ['Absences signalées', total, Math.round(total * 1.08), { goodWhen: 'down' }],
        ['Conseils de discipline', councils[k], k > 0 ? councils[k - 1] : 1, { goodWhen: 'down' }],
        ['Avertissements', warnings[k], k > 0 ? warnings[k - 1] : 2, { goodWhen: 'down' }],
      ]),
      list('Rappel de la semaine précédente', [
        'Absences constatées pour les groupes CV RD, NTC RD et REM RD',
        '4 conseils de discipline : sursis sous exclusion d’un mois',
        '3 avertissements envoyés (rappel à l’ordre)',
      ]),
    ]),
    makeSlide(ctx, S, 'achievements', 1, [
      table('État des absences par groupe', ['Groupe', 'Formation', 'Effectif', 'Absences'], GROUPS.map((g, i) => [g[0], g[1], g[2], absences[i]]), { totalRow: true }),
      chart('Absences par groupe', 'horizontal', sorted.slice(0, 7).map((s) => s.label), [['Absences', sorted.slice(0, 7).map((s) => s.value)]]),
    ], 'État des absences'),
    makeSlide(ctx, S, 'forecast', 2, [
      list('Actions prévues', [
        ['Envoi des avertissements', 'todo'],
        ['Entretiens individuels — CV RP 26/27 Groupe A', 'todo'],
        ['Point avec les entreprises des apprenants les plus absents', 'todo'],
      ]),
    ]),
    makeSlide(ctx, S, 'news', 3, [
      issues('Difficultés à résoudre', [
        [`Absentéisme élevé en MCM 1 RP 26/27 (${absences[7]} absences)`, 'attention', 'Concentré sur 6 apprenants', 'Entretiens tripartites avec les tuteurs'],
      ]),
    ], 'Difficultés à résoudre'),
  ]
}

// ---------------------------------------------------------------------------
// Communication et Support / IMS
// ---------------------------------------------------------------------------
function posterSvg(date: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">
<rect width="1200" height="675" fill="#3661B3"/>
<path d="M760 0h170L700 675H530z" fill="#229CD7" opacity=".55"/><path d="M960 0h240v120L960 675H790z" fill="#2C4F95" opacity=".7"/>
<text x="80" y="150" font-family="Montserrat, Arial, sans-serif" font-size="34" font-weight="600" fill="#BFD4F2">CFA NOVIA</text>
<text x="80" y="290" font-family="Montserrat, Arial, sans-serif" font-size="92" font-weight="800" fill="#fff">Job dating</text>
<text x="80" y="390" font-family="Montserrat, Arial, sans-serif" font-size="92" font-weight="800" fill="#fff">alternance</text>
<rect x="80" y="440" width="120" height="8" rx="4" fill="#229CD7"/>
<text x="80" y="530" font-family="Montserrat, Arial, sans-serif" font-size="40" font-weight="600" fill="#fff">${date} — 13 h 30</text>
<text x="80" y="590" font-family="Montserrat, Arial, sans-serif" font-size="30" fill="#DCE6F6">Campus NOVIA · 40 entreprises · 120 postes</text>
</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function communication(ctx: Ctx): Slide[] {
  const { k } = ctx
  const S = SERVICE_IDS.communication
  const open = [18, 15, 16, 21, 14, 13, 12]
  const solved = [26, 29, 24, 52, 31, 28, 31]
  const delay = [31, 28, 30, 36, 24, 22, 19]
  const posts = [6, 7, 5, 11, 8, 7, 9]
  const prev = (arr: number[]) => (k > 0 ? arr[k - 1] : arr[0])
  const weeksBack = [5, 4, 3, 2, 1, 0].map((n) => shiftWeek(ctx.periods.review.weeks[ctx.periods.review.weeks.length - 1], -n))
  const image: ImageBlock = {
    id: uid(),
    type: 'image',
    title: 'Visuel de la campagne',
    width: 'auto',
    src: posterSvg(formatLongDate(ctx.f(2), false)),
    caption: 'Affiche diffusée sur LinkedIn et sur les écrans du campus',
    fit: 'contain',
  }

  return [
    makeSlide(ctx, S, 'overview', 0, [
      kpis('Chiffres clés', [
        ['Tickets support ouverts', open[k], prev(open), { goodWhen: 'down' }],
        ['Tickets résolus', solved[k], prev(solved)],
        ['Délai moyen de résolution', delay[k], prev(delay), { unit: 'h', goodWhen: 'down' }],
        ['Publications', posts[k], prev(posts)],
      ]),
    ]),
    makeSlide(ctx, S, 'achievements', 1, [
      list('Réalisations', [
        ['Création des comptes IMS pour 24 nouveaux apprenants', 'done'],
        ['Campagne LinkedIn du job dating lancée', 'done'],
        ['Mise à jour des pages formations BIM du site', 'done'],
        ['Inventaire du parc informatique — salle 3', 'ongoing'],
      ]),
      chart('Tickets support sur 6 semaines', 'line', weeksBack.map((w) => `S${w.week}`), [
        ['Ouverts', weeksBack.map((_, i) => open[Math.max(0, k - 5 + i)] ?? open[0])],
        ['Résolus', weeksBack.map((_, i) => solved[Math.max(0, k - 5 + i)] ?? solved[0])],
      ], { showValues: false }),
      image,
    ]),
    makeSlide(ctx, S, 'forecast', 2, [
      list('Prévisions', [
        ['Supports visuels du job dating (affiches, carrousel LinkedIn)', 'ongoing'],
        ['Migration des postes de la salle 3', 'todo'],
        ['Newsletter des entreprises partenaires', 'todo'],
      ]),
      events('Échéances', [
        [ctx.f(1), 'Livraison des supports du job dating'],
        [ctx.f(2), 'Migration des postes — salle 3', 'Intervention de 8 h à 12 h'],
        [ctx.f(3), 'Envoi de la newsletter partenaires'],
      ]),
    ]),
    makeSlide(ctx, S, 'news', 3, [
      issues('Difficultés à résoudre', [
        ['Wi-Fi instable au 2e étage', 'attention', 'Coupures signalées en salles 204 et 207', 'Intervention du prestataire réseau'],
      ]),
    ], 'Difficultés à résoudre'),
  ]
}

// ---------------------------------------------------------------------------

function statusFor(serviceId: string, k: number): SubmissionStatus {
  if (k < LAST) return 'validated'
  switch (serviceId) {
    case SERVICE_IDS.pedagogie:
      return 'submitted'
    case SERVICE_IDS.commercial:
      return 'validated'
    case SERVICE_IDS.administratif:
      return 'in_progress'
    case SERVICE_IDS.vieScolaire:
      return 'draft'
    default:
      return 'submitted'
  }
}

export function generateDemoData(today: string = todayInParis(), nowTime: string = nowTimeInParis()): DemoData {
  const settings = { ...DEFAULT_SETTINGS }
  const services = defaultServices()
  const users = defaultUsers()
  const templates = defaultTemplates()
  const current = weekOf(nextMeetingDate(today, settings.meetingWeekday, settings.meetingTime, nowTime))

  const bundles: Record<string, MeetingBundle> = {}
  const meetings: Meeting[] = []
  let previous: MeetingBundle | null = null

  PLAN.forEach((step, k) => {
    const week: WeekInfo = shiftWeek(current, step.offset)
    const meetingId = uid()
    const meetingDate = dateInWeek(week, settings.meetingWeekday)
    const isCurrent = k === LAST
    const durations = Object.fromEntries(services.map((s) => [s.id, s.durationMinutes]))
    const actual: Record<string, number> = {
      [SERVICE_IDS.pedagogie]: 330 + ((k * 37) % 90),
      [SERVICE_IDS.commercial]: 400 + ((k * 53) % 110),
      [SERVICE_IDS.administratif]: 300 + ((k * 29) % 80),
      [SERVICE_IDS.vieScolaire]: 150 + ((k * 17) % 60),
      [SERVICE_IDS.communication]: 140 + ((k * 23) % 70),
    }
    const totalActual = Object.values(actual).reduce((a, b) => a + b, 0) + 70
    const stamp = `${addDays(meetingDate, -2)}T15:00:00.000Z`

    const meeting: Meeting = {
      id: meetingId,
      isoYear: week.year,
      isoWeek: week.week,
      weekStart: week.start,
      weekEnd: week.end,
      reviewWeeks: step.reviewWeeks,
      forecastReference: settings.forecastReference,
      meetingDate,
      meetingTime: settings.meetingTime,
      status: isCurrent ? 'preparation' : k === LAST - 1 ? 'held' : 'archived',
      title: null,
      notes: step.reviewWeeks > 1 ? 'Réunion couvrant deux semaines (vacances scolaires).' : '',
      durations,
      participants: services.map((s) => s.id),
      duplicatedFrom: previous?.meeting.id ?? null,
      timing: isCurrent ? null : { totalSeconds: totalActual, perService: actual, endedAt: `${meetingDate}T09:${String(26 + (k % 4)).padStart(2, '0')}:00.000Z` },
      createdAt: stamp,
      updatedAt: stamp,
    }
    const periods = computePeriods(meeting)
    const ctx: Ctx = { k, meetingId, periods, rand: rng(1000 + k * 7919), f: (d) => addDays(periods.forecast.start, d) }

    const statuses = Object.fromEntries(services.map((s) => [s.id, statusFor(s.id, k)])) as Record<string, SubmissionStatus>
    let vsSlides = vieScolaire(ctx)
    if (isCurrent && previous) {
      // Vie scolaire n'a pas encore commencé : contenu repris automatiquement de la semaine précédente.
      vsSlides = previous.slides
        .filter((s) => s.serviceId === SERVICE_IDS.vieScolaire)
        .map((s) => ({ ...s, id: uid(), meetingId, blocks: s.blocks.map((b) => cloneBlock(b, { carryKpis: true })) }))
    }

    const slides = [...pedagogie(ctx), ...commercial(ctx), ...administratif(ctx, statuses[SERVICE_IDS.administratif]), ...vsSlides, ...communication(ctx)]

    const submissions = services.map((s) => {
      const sub = blankSubmission(meetingId, s.id)
      const status = statuses[s.id]
      sub.status = status
      sub.updatedAt = stamp
      sub.updatedBy = status === 'draft' ? null : s.managerId
      if (status === 'submitted' || status === 'validated') sub.submittedAt = `${addDays(meetingDate, -2)}T16:${String(10 + s.position * 7).padStart(2, '0')}:00.000Z`
      if (status === 'validated') {
        sub.validatedAt = `${addDays(meetingDate, -1)}T08:${String(30 + s.position * 4).padStart(2, '0')}:00.000Z`
        sub.validatedBy = USER_IDS.direction
      }
      return sub
    })

    const bundle: MeetingBundle = { meeting, submissions, slides, attachments: [] }
    bundles[meetingId] = bundle
    meetings.push(meeting)
    previous = bundle
  })

  return { snapshot: { settings, services, templates, users, meetings }, bundles }
}
