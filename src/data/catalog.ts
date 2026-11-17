import { createBlock, kpiItem } from '@/domain/blocks'
import type {
  AppSettings,
  AppUser,
  Block,
  EventsBlock,
  IssuesBlock,
  KpiBlock,
  KpiTrend,
  ListBlock,
  Service,
  SlideKind,
  SlideTemplate,
  TableBlock,
} from '@/domain/types'
import { uid } from '@/lib/ids'

// ---------------------------------------------------------------------------
// Référentiel par défaut de CFA NOVIA (repris de la présentation Flash Synchro)
// Les identifiants sont fixes pour rester alignés avec supabase/seed.sql.
// ---------------------------------------------------------------------------

export const SERVICE_IDS = {
  pedagogie: '5e1d0001-0000-4000-8000-000000000001',
  commercial: '5e1d0001-0000-4000-8000-000000000002',
  administratif: '5e1d0001-0000-4000-8000-000000000003',
  vieScolaire: '5e1d0001-0000-4000-8000-000000000004',
  communication: '5e1d0001-0000-4000-8000-000000000005',
} as const

export const USER_IDS = {
  direction: 'a5e70001-0000-4000-8000-000000000001',
  pedagogie: 'a5e70001-0000-4000-8000-000000000002',
  commercial: 'a5e70001-0000-4000-8000-000000000003',
  administratif: 'a5e70001-0000-4000-8000-000000000004',
  vieScolaire: 'a5e70001-0000-4000-8000-000000000005',
  communication: 'a5e70001-0000-4000-8000-000000000006',
  collaborateur: 'a5e70001-0000-4000-8000-000000000007',
} as const

/** Palettes de service : teintes historiques des diapositives, contrastes vérifiés. */
export const SERVICE_PALETTES = {
  orange: { accent: '#D9702C', strong: '#9A4A16', soft: '#FCD5B5', tint: '#FDF2E9' },
  blue: { accent: '#3E7CC4', strong: '#24548E', soft: '#C9DAF0', tint: '#EEF4FB' },
  olive: { accent: '#6F8F2F', strong: '#4B6419', soft: '#D7E4BC', tint: '#F2F6E9' },
  purple: { accent: '#7C55B0', strong: '#5A3C85', soft: '#DDD3EC', tint: '#F5F1FA' },
  rose: { accent: '#C0504D', strong: '#8E302D', soft: '#EBC6C5', tint: '#FBF0EF' },
  teal: { accent: '#16928A', strong: '#0D5F59', soft: '#C2E6E2', tint: '#ECF7F6' },
  slate: { accent: '#5B6B82', strong: '#36445A', soft: '#D5DCE6', tint: '#F2F4F8' },
} as const

export type PaletteKey = keyof typeof SERVICE_PALETTES

export const PALETTE_LABELS: Record<PaletteKey, string> = {
  orange: 'Pêche',
  blue: 'Bleu acier',
  olive: 'Vert olive',
  purple: 'Lavande',
  rose: 'Vieux rose',
  teal: 'Sarcelle',
  slate: 'Ardoise',
}

export const DEFAULT_SETTINGS: AppSettings = {
  orgName: 'CFA NOVIA',
  tagline: 'Outils de communication, de pilotage et de travail commun',
  meetingWeekday: 4,
  meetingTime: '10:00',
  forecastReference: 'next',
  submissionDeadlineDaysBefore: 1,
  submissionDeadlineTime: '17:00',
  warningSeconds: 60,
  showSectionSlides: true,
  autoCreateWeeklyMeeting: true,
  syncTimerWithSlides: true,
}

export function defaultServices(): Service[] {
  return [
    {
      id: SERVICE_IDS.pedagogie,
      slug: 'pedagogie',
      name: 'Service pédagogique',
      shortName: 'Pédagogie',
      palette: { ...SERVICE_PALETTES.orange },
      icon: 'graduation',
      durationMinutes: 6,
      position: 0,
      active: true,
      managerId: USER_IDS.pedagogie,
      description: 'Formations, examens, certifications et bulletins',
    },
    {
      id: SERVICE_IDS.commercial,
      slug: 'commercial',
      name: 'Service commercial',
      shortName: 'Commercial',
      palette: { ...SERVICE_PALETTES.blue },
      icon: 'briefcase',
      durationMinutes: 7,
      position: 1,
      active: true,
      managerId: USER_IDS.commercial,
      description: 'Contrats d’apprentissage, accords et suivi des apprenants',
    },
    {
      id: SERVICE_IDS.administratif,
      slug: 'administratif',
      name: 'Service administratif',
      shortName: 'Administratif',
      palette: { ...SERVICE_PALETTES.olive },
      icon: 'folder',
      durationMinutes: 6,
      position: 2,
      active: true,
      managerId: USER_IDS.administratif,
      description: 'Dossiers, OPCO, facturation et abandons',
    },
    {
      id: SERVICE_IDS.vieScolaire,
      slug: 'vie-scolaire',
      name: 'Vie scolaire',
      shortName: 'Vie scolaire',
      palette: { ...SERVICE_PALETTES.purple },
      icon: 'users',
      durationMinutes: 3,
      position: 3,
      active: true,
      managerId: USER_IDS.vieScolaire,
      description: 'Absences, discipline et accompagnement des apprenants',
    },
    {
      id: SERVICE_IDS.communication,
      slug: 'communication',
      name: 'Communication et Support / IMS',
      shortName: 'Communication & IMS',
      palette: { ...SERVICE_PALETTES.rose },
      icon: 'megaphone',
      durationMinutes: 3,
      position: 4,
      active: true,
      managerId: USER_IDS.communication,
      description: 'Communication, support informatique et plateforme IMS',
    },
  ]
}

export function defaultUsers(): AppUser[] {
  return [
    { id: USER_IDS.direction, fullName: 'Sophie Marchand', email: 'sophie.marchand@demo-novia.fr', role: 'admin', serviceId: null, jobTitle: 'Directrice' },
    { id: USER_IDS.pedagogie, fullName: 'Karim Benali', email: 'karim.benali@demo-novia.fr', role: 'manager', serviceId: SERVICE_IDS.pedagogie, jobTitle: 'Responsable pédagogique' },
    { id: USER_IDS.commercial, fullName: 'Laura Fontaine', email: 'laura.fontaine@demo-novia.fr', role: 'manager', serviceId: SERVICE_IDS.commercial, jobTitle: 'Responsable commerciale' },
    { id: USER_IDS.administratif, fullName: 'Thomas Girard', email: 'thomas.girard@demo-novia.fr', role: 'manager', serviceId: SERVICE_IDS.administratif, jobTitle: 'Responsable administratif' },
    { id: USER_IDS.vieScolaire, fullName: 'Inès Moreau', email: 'ines.moreau@demo-novia.fr', role: 'manager', serviceId: SERVICE_IDS.vieScolaire, jobTitle: 'Responsable vie scolaire' },
    { id: USER_IDS.communication, fullName: 'Julien Roche', email: 'julien.roche@demo-novia.fr', role: 'manager', serviceId: SERVICE_IDS.communication, jobTitle: 'Responsable communication et IMS' },
    { id: USER_IDS.collaborateur, fullName: 'Camille Lefèvre', email: 'camille.lefevre@demo-novia.fr', role: 'viewer', serviceId: null, jobTitle: 'Chargée de mission qualité' },
  ]
}

// ---------------------------------------------------------------------------
// Fabriques compactes de blocs (utilisées par les modèles et la démo)
// ---------------------------------------------------------------------------

type KpiSpec = [label: string, value?: string | number, previous?: string | number, opts?: { unit?: string; target?: string | number; goodWhen?: KpiTrend }]

export function kpis(title: string, specs: KpiSpec[]): KpiBlock {
  return {
    ...(createBlock('kpis') as KpiBlock),
    title,
    items: specs.map(([label, value = '', previous = '', opts = {}]) =>
      kpiItem({
        label,
        value: String(value),
        previous: String(previous),
        unit: opts.unit ?? '',
        target: opts.target !== undefined ? String(opts.target) : '',
        goodWhen: opts.goodWhen ?? 'up',
      }),
    ),
  }
}

export function list(title: string, items: (string | [string, 'done' | 'ongoing' | 'todo'])[], style: ListBlock['style'] = 'bullets'): ListBlock {
  return {
    ...(createBlock('list') as ListBlock),
    title,
    style,
    items: items.map((it) => (typeof it === 'string' ? { id: uid(), text: it, status: 'none' as const } : { id: uid(), text: it[0], status: it[1] })),
  }
}

export function table(title: string, columns: string[], rows: (string | number)[][], opts: { totalRow?: boolean; caption?: string; width?: Block['width'] } = {}): TableBlock {
  return {
    ...(createBlock('table') as TableBlock),
    title,
    columns,
    rows: rows.map((r) => r.map(String)),
    totalRow: opts.totalRow ?? false,
    caption: opts.caption ?? '',
    width: opts.width ?? 'auto',
  }
}

export function events(title: string, items: [date: string, title: string, detail?: string, endDate?: string, time?: string][]): EventsBlock {
  return {
    ...(createBlock('events') as EventsBlock),
    title,
    items: items.map(([date, t, detail = '', endDate = '', time = '']) => ({ id: uid(), date, endDate, time, title: t, detail })),
  }
}

export function issues(title: string, items: [title: string, severity: 'info' | 'attention' | 'blocking', detail?: string, need?: string][]): IssuesBlock {
  return {
    ...(createBlock('issues') as IssuesBlock),
    title,
    items: items.map(([t, severity, detail = '', need = '']) => ({ id: uid(), title: t, severity, detail, need })),
  }
}

// ---------------------------------------------------------------------------
// Modèles de diapositives par service (structure du PDF : 4 diapositives + annexes)
// ---------------------------------------------------------------------------

function tpl(serviceId: string, kind: SlideKind, position: number, blocks: Block[], title = ''): SlideTemplate {
  return { id: uid(), serviceId, kind, title, position, blocks }
}

export function defaultTemplates(): SlideTemplate[] {
  const S = SERVICE_IDS
  const forecastBlocks = (): Block[] => [events('Événements programmés', []), list('Actions prioritaires', [])]
  const newsBlocks = (): Block[] => [issues('Points d’attention', [])]
  return [
    // Pédagogie
    tpl(S.pedagogie, 'overview', 0, [
      kpis('Chiffres clés', [['Apprenants en formation'], ['Classes actives'], ['Taux de présence', '', '', { unit: '%' }], ['Bulletins publiés']]),
      list('Rappel de la semaine précédente', []),
    ]),
    tpl(S.pedagogie, 'achievements', 1, [list('Travail réalisé', []), table('Résultats aux examens', ['Résultat', 'Formation 1', 'Formation 2'], [['Inscrits', '', ''], ['Réussite', '', ''], ['Échec', '', '']])]),
    tpl(S.pedagogie, 'forecast', 2, forecastBlocks()),
    tpl(S.pedagogie, 'news', 3, newsBlocks()),
    // Commercial
    tpl(S.commercial, 'overview', 0, [
      kpis('Situation des contrats', [['Total contrats 25/26'], ['Accords 25/26'], ['Total contrats 26/27'], ['Accords 26/27'], ['Suivi apprenants']]),
    ]),
    tpl(S.commercial, 'achievements', 1, [
      kpis('Contrats et suivis', [['Total contrats 26/27'], ['Accords 26/27'], ['Suivi apprenants']]),
      table('Contrats par chargé(e) de relations entreprises', ['Chargé(e)', 'En cours de signature', 'Signés', 'Total'], [], { totalRow: true }),
    ]),
    tpl(S.commercial, 'custom', 2, [table('Tableau des étoiles', ['Chargé(e)', 'Étoiles'], [], { totalRow: true })], 'Tableau des étoiles'),
    tpl(S.commercial, 'forecast', 3, forecastBlocks()),
    tpl(S.commercial, 'news', 4, newsBlocks()),
    // Administratif
    tpl(S.administratif, 'overview', 0, [
      kpis('Chiffres clés', [['Abandons officiels', '', '', { goodWhen: 'down' }], ['Dossiers complets'], ['Conventions en attente', '', '', { goodWhen: 'down' }]]),
    ]),
    tpl(S.administratif, 'achievements', 1, [list('Contrats et suivis', [])]),
    tpl(S.administratif, 'forecast', 2, forecastBlocks()),
    tpl(S.administratif, 'news', 3, newsBlocks()),
    // Vie scolaire
    tpl(S.vieScolaire, 'overview', 0, [kpis('Chiffres clés', [['Absences signalées', '', '', { goodWhen: 'down' }], ['Conseils de discipline', '', '', { goodWhen: 'down' }], ['Avertissements', '', '', { goodWhen: 'down' }]]), list('Rappel de la semaine précédente', [])]),
    tpl(S.vieScolaire, 'achievements', 1, [table('État des absences', ['Groupe', 'Formation', 'Effectif', 'Absences'], [], { totalRow: true })], 'État des absences'),
    tpl(S.vieScolaire, 'forecast', 2, [list('Actions prévues', [])]),
    tpl(S.vieScolaire, 'news', 3, newsBlocks(), 'Difficultés à résoudre'),
    // Communication & IMS
    tpl(S.communication, 'overview', 0, [kpis('Chiffres clés', [['Tickets support ouverts', '', '', { goodWhen: 'down' }], ['Tickets résolus'], ['Délai moyen de résolution', '', '', { unit: 'h', goodWhen: 'down' }], ['Publications']])]),
    tpl(S.communication, 'achievements', 1, [list('Réalisations', [])]),
    tpl(S.communication, 'forecast', 2, forecastBlocks()),
    tpl(S.communication, 'news', 3, newsBlocks(), 'Difficultés à résoudre'),
  ]
}
