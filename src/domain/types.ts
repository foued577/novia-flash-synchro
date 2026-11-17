// ---------------------------------------------------------------------------
// Modèle métier de NOVIA Flash Synchro
// Ces types sont partagés par le mode démonstration (localStorage) et Supabase.
// ---------------------------------------------------------------------------

export type Role = 'admin' | 'manager' | 'viewer'
export type SubmissionStatus = 'draft' | 'in_progress' | 'submitted' | 'validated'
export type MeetingStatus = 'preparation' | 'ready' | 'held' | 'archived'
export type SlideKind = 'overview' | 'achievements' | 'forecast' | 'news' | 'custom'
/** Semaine de prévision : la semaine suivant la réunion (S+1) ou la semaine de la réunion (S). */
export type ForecastReference = 'next' | 'current'

export interface ServicePalette {
  /** Couleur d'identité (marques, rubans, graphiques). */
  accent: string
  /** Variante foncée lisible pour du texte sur fond clair. */
  strong: string
  /** Teinte douce (reprend les fonds des diapositives historiques). */
  soft: string
  /** Lavis très clair pour les fonds d'en-tête. */
  tint: string
}

export type ServiceIcon = 'graduation' | 'briefcase' | 'folder' | 'users' | 'megaphone' | 'building' | 'sparkles'

export interface Service {
  id: string
  slug: string
  name: string
  shortName: string
  palette: ServicePalette
  icon: ServiceIcon
  durationMinutes: number
  position: number
  active: boolean
  managerId: string | null
  description: string
}

export interface AppUser {
  id: string
  fullName: string
  email: string
  role: Role
  serviceId: string | null
  jobTitle: string
}

export interface AppSettings {
  orgName: string
  tagline: string
  /** Jour ISO de la réunion : 1 = lundi … 7 = dimanche. */
  meetingWeekday: number
  /** Heure de début, format HH:mm. */
  meetingTime: string
  forecastReference: ForecastReference
  /** Date limite de saisie : nombre de jours avant la réunion. */
  submissionDeadlineDaysBefore: number
  submissionDeadlineTime: string
  /** Seuil d'alerte du chronomètre (secondes restantes). */
  warningSeconds: number
  showSectionSlides: boolean
  autoCreateWeeklyMeeting: boolean
  syncTimerWithSlides: boolean
}

export interface MeetingTiming {
  totalSeconds: number
  perService: Record<string, number>
  endedAt: string
}

export interface Meeting {
  id: string
  isoYear: number
  isoWeek: number
  /** Lundi de la semaine ISO (YYYY-MM-DD). */
  weekStart: string
  /** Dimanche de la semaine ISO (YYYY-MM-DD). */
  weekEnd: string
  /** Nombre de semaines couvertes par les réalisations (1 = S-1, 2 = S-2 et S-1…). */
  reviewWeeks: number
  forecastReference: ForecastReference
  meetingDate: string
  meetingTime: string
  status: MeetingStatus
  /** Titre personnalisé (null = titre automatique). */
  title: string | null
  notes: string
  /** Durées allouées par service (minutes) pour cette réunion. */
  durations: Record<string, number>
  /** Services participants, dans l'ordre de passage. */
  participants: string[]
  duplicatedFrom: string | null
  timing: MeetingTiming | null
  createdAt: string
  updatedAt: string
}

export interface Submission {
  id: string
  meetingId: string
  serviceId: string
  status: SubmissionStatus
  /** Commentaire de l'administrateur (renvoi, validation…). */
  comment: string
  updatedAt: string
  updatedBy: string | null
  submittedAt: string | null
  validatedAt: string | null
  validatedBy: string | null
}

// ---------------------------------------------------------------------------
// Blocs de contenu des diapositives
// ---------------------------------------------------------------------------

export type BlockWidth = 'auto' | 'full' | 'half'

interface BlockBase {
  id: string
  title: string
  width: BlockWidth
}

export type KpiTrend = 'up' | 'down' | 'neutral'

export interface KpiItem {
  id: string
  label: string
  value: string
  /** Valeur de rappel (semaine précédente). */
  previous: string
  unit: string
  target: string
  /** Sens favorable d'une évolution. */
  goodWhen: KpiTrend
}

export interface KpiBlock extends BlockBase {
  type: 'kpis'
  items: KpiItem[]
}

export type ListItemStatus = 'none' | 'done' | 'ongoing' | 'todo'

export interface ListItem {
  id: string
  text: string
  status: ListItemStatus
}

export interface ListBlock extends BlockBase {
  type: 'list'
  style: 'bullets' | 'numbered' | 'checklist'
  items: ListItem[]
}

export interface TableBlock extends BlockBase {
  type: 'table'
  columns: string[]
  rows: string[][]
  /** Ajoute une ligne de total calculée automatiquement. */
  totalRow: boolean
  caption: string
}

export type ChartType = 'bar' | 'stacked' | 'horizontal' | 'line' | 'donut'

export interface ChartSeries {
  id: string
  name: string
  color: string | null
  values: (number | null)[]
}

export interface ChartBlock extends BlockBase {
  type: 'chart'
  chartType: ChartType
  categories: string[]
  series: ChartSeries[]
  unit: string
  showValues: boolean
}

export type TextTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

export interface TextBlock extends BlockBase {
  type: 'text'
  text: string
  tone: TextTone
}

export interface ImageBlock extends BlockBase {
  type: 'image'
  src: string
  caption: string
  fit: 'contain' | 'cover'
}

export interface EventItem {
  id: string
  date: string
  endDate: string
  time: string
  title: string
  detail: string
}

export interface EventsBlock extends BlockBase {
  type: 'events'
  items: EventItem[]
}

export type IssueSeverity = 'info' | 'attention' | 'blocking'

export interface IssueItem {
  id: string
  title: string
  detail: string
  severity: IssueSeverity
  /** Besoin d'accompagnement exprimé. */
  need: string
}

export interface IssuesBlock extends BlockBase {
  type: 'issues'
  items: IssueItem[]
}

export type Block = KpiBlock | ListBlock | TableBlock | ChartBlock | TextBlock | ImageBlock | EventsBlock | IssuesBlock
export type BlockType = Block['type']

export interface Slide {
  id: string
  meetingId: string
  serviceId: string
  kind: SlideKind
  /** Titre personnalisé ('' = titre automatique selon le type). */
  title: string
  /** Sous-titre personnalisé ('' = période calculée automatiquement). */
  subtitle: string
  position: number
  hidden: boolean
  blocks: Block[]
  notes: string
  updatedAt: string
}

export interface SlideTemplate {
  id: string
  serviceId: string
  kind: SlideKind
  title: string
  position: number
  blocks: Block[]
}

export interface Attachment {
  id: string
  meetingId: string
  serviceId: string
  fileName: string
  mimeType: string
  sizeBytes: number
  /** URL de téléchargement (data URL en démo, URL signée Supabase sinon). */
  url: string
  storagePath: string | null
  uploadedBy: string | null
  createdAt: string
}

export interface MeetingBundle {
  meeting: Meeting
  submissions: Submission[]
  slides: Slide[]
  attachments: Attachment[]
}

export interface Snapshot {
  settings: AppSettings
  services: Service[]
  templates: SlideTemplate[]
  users: AppUser[]
  meetings: Meeting[]
}
