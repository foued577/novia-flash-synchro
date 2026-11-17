import type { AppUser, SubmissionStatus } from './types'

// ---------------------------------------------------------------------------
// Règles d'accès côté interface.
// Les mêmes règles sont appliquées côté serveur par les politiques RLS
// (supabase/migrations/0002_security.sql).
// ---------------------------------------------------------------------------

export const isAdmin = (u: AppUser | null) => u?.role === 'admin'

export const managesService = (u: AppUser | null, serviceId: string) =>
  !!u && u.role === 'manager' && u.serviceId === serviceId

/** Peut modifier le contenu d'un service pour une réunion donnée. */
export function canEditService(u: AppUser | null, serviceId: string, status: SubmissionStatus): boolean {
  if (isAdmin(u)) return true
  return managesService(u, serviceId) && (status === 'draft' || status === 'in_progress')
}

export function canSubmit(u: AppUser | null, serviceId: string, status: SubmissionStatus): boolean {
  return (isAdmin(u) || managesService(u, serviceId)) && (status === 'draft' || status === 'in_progress')
}

/** Le responsable peut retirer sa soumission tant qu'elle n'est pas validée. */
export function canWithdraw(u: AppUser | null, serviceId: string, status: SubmissionStatus): boolean {
  return managesService(u, serviceId) && status === 'submitted'
}

export const canValidate = (u: AppUser | null, status: SubmissionStatus) => isAdmin(u) && status === 'submitted'

export const canReturn = (u: AppUser | null, status: SubmissionStatus) =>
  isAdmin(u) && (status === 'submitted' || status === 'validated')

export const canManageMeetings = (u: AppUser | null) => isAdmin(u)
export const canManageSettings = (u: AppUser | null) => isAdmin(u)
/** La présentation est consultable par tous les profils connectés. */
export const canPresent = (u: AppUser | null) => !!u
