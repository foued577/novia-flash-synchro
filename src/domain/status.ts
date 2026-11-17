import type { IssueSeverity, MeetingStatus, Role, SubmissionStatus } from './types'

// ---------------------------------------------------------------------------
// Libellés et rendu des statuts (toujours icône + libellé, jamais la couleur seule)
// ---------------------------------------------------------------------------

export interface StatusStyle {
  label: string
  /** Classes Tailwind du badge. */
  badge: string
  /** Couleur de pastille (hex) pour les rubans et graphiques. */
  dot: string
  description: string
}

export const SUBMISSION_STATUS: Record<SubmissionStatus, StatusStyle> = {
  draft: {
    label: 'Brouillon',
    badge: 'bg-slate-100 text-slate-700 ring-slate-200',
    dot: '#94A3B8',
    description: 'Aucune saisie commencée pour cette semaine',
  },
  in_progress: {
    label: 'En cours',
    badge: 'bg-amber-50 text-amber-800 ring-amber-200',
    dot: '#E3A008',
    description: 'Saisie commencée, pas encore soumise',
  },
  submitted: {
    label: 'Soumis',
    badge: 'bg-novia-50 text-novia-700 ring-novia-200',
    dot: '#3661B3',
    description: 'Transmis à l’administrateur, en attente de validation',
  },
  validated: {
    label: 'Validé',
    badge: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    dot: '#16A34A',
    description: 'Contenu validé, prêt pour la présentation',
  },
}

export const SUBMISSION_ORDER: SubmissionStatus[] = ['draft', 'in_progress', 'submitted', 'validated']

export const isSubmitted = (s: SubmissionStatus) => s === 'submitted' || s === 'validated'

export const MEETING_STATUS: Record<MeetingStatus, StatusStyle> = {
  preparation: {
    label: 'En préparation',
    badge: 'bg-amber-50 text-amber-800 ring-amber-200',
    dot: '#E3A008',
    description: 'Les services complètent leurs informations',
  },
  ready: {
    label: 'Prête',
    badge: 'bg-novia-50 text-novia-700 ring-novia-200',
    dot: '#3661B3',
    description: 'Tous les contenus sont prêts à être présentés',
  },
  held: {
    label: 'Tenue',
    badge: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    dot: '#16A34A',
    description: 'La réunion a eu lieu',
  },
  archived: {
    label: 'Archivée',
    badge: 'bg-slate-100 text-slate-600 ring-slate-200',
    dot: '#94A3B8',
    description: 'Présentation archivée et consultable',
  },
}

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrateur',
  manager: 'Responsable de service',
  viewer: 'Collaborateur',
}

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: 'Accès complet : réunions, validation, paramètres et utilisateurs',
  manager: 'Saisit et soumet les informations de son service',
  viewer: 'Consulte les réunions et les présentations',
}

export const SEVERITY: Record<IssueSeverity, { label: string; color: string; bg: string; text: string }> = {
  info: { label: 'Information', color: '#3661B3', bg: '#EEF3FB', text: '#2C4F95' },
  attention: { label: 'Attention', color: '#D97706', bg: '#FEF6E7', text: '#8A4B06' },
  blocking: { label: 'Bloquant', color: '#D03B3B', bg: '#FDEEEE', text: '#A12A2A' },
}
