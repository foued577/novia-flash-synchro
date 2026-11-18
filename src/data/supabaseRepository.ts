import { createClient, type PostgrestError, type SupabaseClient } from '@supabase/supabase-js'
import type {
  AppSettings,
  AppUser,
  Attachment,
  Block,
  Meeting,
  MeetingBundle,
  Service,
  ServiceIcon,
  ServicePalette,
  Slide,
  SlideTemplate,
  Snapshot,
  Submission,
} from '@/domain/types'
import { compressImage } from '@/lib/files'
import { uid } from '@/lib/ids'
import { DEFAULT_SETTINGS } from './catalog'
import type { DataRepository, UploadContext } from './repository'

// ---------------------------------------------------------------------------
// Implémentation Supabase (PostgreSQL + Auth + Storage + Realtime).
// Schéma : supabase/migrations/*.sql — sécurité assurée par les politiques RLS.
// ---------------------------------------------------------------------------

const ATTACHMENTS_BUCKET = 'attachments'
const IMAGES_BUCKET = 'slide-images'

// ----- Lignes de la base (snake_case) ------------------------------------------

interface ServiceRow {
  id: string
  slug: string
  name: string
  short_name: string
  palette: ServicePalette
  icon: string
  duration_minutes: number
  position: number
  active: boolean
  manager_id: string | null
  description: string
}

interface ProfileRow {
  id: string
  full_name: string
  email: string
  role: AppUser['role']
  service_id: string | null
  job_title: string
}

interface TemplateRow {
  id: string
  service_id: string
  kind: SlideTemplate['kind']
  title: string
  position: number
  blocks: Block[]
}

interface MeetingRow {
  id: string
  iso_year: number
  iso_week: number
  week_start: string
  week_end: string
  review_weeks: number
  forecast_reference: Meeting['forecastReference']
  meeting_date: string
  meeting_time: string
  status: Meeting['status']
  title: string | null
  notes: string
  durations: Record<string, number>
  participants: string[]
  duplicated_from: string | null
  timing: Meeting['timing']
  created_at: string
  updated_at: string
}

interface SubmissionRow {
  id: string
  meeting_id: string
  service_id: string
  status: Submission['status']
  comment: string
  updated_at: string
  updated_by: string | null
  submitted_at: string | null
  validated_at: string | null
  validated_by: string | null
}

interface SlideRow {
  id: string
  meeting_id: string
  service_id: string
  kind: Slide['kind']
  title: string
  subtitle: string
  position: number
  hidden: boolean
  blocks: Block[]
  notes: string
  updated_at: string
}

interface AttachmentRow {
  id: string
  meeting_id: string
  service_id: string
  file_name: string
  mime_type: string
  size_bytes: number
  storage_path: string
  uploaded_by: string | null
  created_at: string
}

// ----- Conversions ----------------------------------------------------------------

const toService = (r: ServiceRow): Service => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  shortName: r.short_name,
  palette: r.palette,
  icon: r.icon as ServiceIcon,
  durationMinutes: r.duration_minutes,
  position: r.position,
  active: r.active,
  managerId: r.manager_id,
  description: r.description,
})

const fromService = (s: Service): ServiceRow => ({
  id: s.id,
  slug: s.slug,
  name: s.name,
  short_name: s.shortName,
  palette: s.palette,
  icon: s.icon,
  duration_minutes: s.durationMinutes,
  position: s.position,
  active: s.active,
  manager_id: s.managerId,
  description: s.description,
})

const toUser = (r: ProfileRow): AppUser => ({
  id: r.id,
  fullName: r.full_name || r.email,
  email: r.email,
  role: r.role,
  serviceId: r.service_id,
  jobTitle: r.job_title,
})

const toTemplate = (r: TemplateRow): SlideTemplate => ({ id: r.id, serviceId: r.service_id, kind: r.kind, title: r.title, position: r.position, blocks: r.blocks ?? [] })

const toMeeting = (r: MeetingRow): Meeting => ({
  id: r.id,
  isoYear: r.iso_year,
  isoWeek: r.iso_week,
  weekStart: r.week_start,
  weekEnd: r.week_end,
  reviewWeeks: r.review_weeks,
  forecastReference: r.forecast_reference,
  meetingDate: r.meeting_date,
  meetingTime: (r.meeting_time ?? '10:00').slice(0, 5),
  status: r.status,
  title: r.title,
  notes: r.notes ?? '',
  durations: r.durations ?? {},
  participants: r.participants ?? [],
  duplicatedFrom: r.duplicated_from,
  timing: r.timing,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

const fromMeeting = (m: Meeting): Omit<MeetingRow, 'created_at' | 'updated_at'> => ({
  id: m.id,
  iso_year: m.isoYear,
  iso_week: m.isoWeek,
  week_start: m.weekStart,
  week_end: m.weekEnd,
  review_weeks: m.reviewWeeks,
  forecast_reference: m.forecastReference,
  meeting_date: m.meetingDate,
  meeting_time: m.meetingTime,
  status: m.status,
  title: m.title,
  notes: m.notes,
  durations: m.durations,
  participants: m.participants,
  duplicated_from: m.duplicatedFrom,
  timing: m.timing,
})

const toSubmission = (r: SubmissionRow): Submission => ({
  id: r.id,
  meetingId: r.meeting_id,
  serviceId: r.service_id,
  status: r.status,
  comment: r.comment ?? '',
  updatedAt: r.updated_at,
  updatedBy: r.updated_by,
  submittedAt: r.submitted_at,
  validatedAt: r.validated_at,
  validatedBy: r.validated_by,
})

const fromSubmission = (s: Submission): SubmissionRow => ({
  id: s.id,
  meeting_id: s.meetingId,
  service_id: s.serviceId,
  status: s.status,
  comment: s.comment,
  updated_at: s.updatedAt,
  updated_by: s.updatedBy,
  submitted_at: s.submittedAt,
  validated_at: s.validatedAt,
  validated_by: s.validatedBy,
})

const toSlide = (r: SlideRow): Slide => ({
  id: r.id,
  meetingId: r.meeting_id,
  serviceId: r.service_id,
  kind: r.kind,
  title: r.title ?? '',
  subtitle: r.subtitle ?? '',
  position: r.position,
  hidden: r.hidden,
  blocks: r.blocks ?? [],
  notes: r.notes ?? '',
  updatedAt: r.updated_at,
})

const fromSlide = (s: Slide): SlideRow => ({
  id: s.id,
  meeting_id: s.meetingId,
  service_id: s.serviceId,
  kind: s.kind,
  title: s.title,
  subtitle: s.subtitle,
  position: s.position,
  hidden: s.hidden,
  blocks: s.blocks,
  notes: s.notes,
  updated_at: s.updatedAt,
})

function fail(error: PostgrestError | Error | null | undefined, context: string): never {
  const raw = error?.message ?? 'Erreur inconnue'
  const code = (error as PostgrestError | undefined)?.code
  if (code === '42501' || /row-level security|permission denied/i.test(raw)) {
    throw new Error(`${context} : action non autorisée pour votre profil.`)
  }
  if (/Invalid login credentials/i.test(raw)) throw new Error('Adresse e-mail ou mot de passe incorrect.')
  if (/Email not confirmed/i.test(raw)) throw new Error('Adresse e-mail non confirmée : consultez votre messagerie.')
  throw new Error(`${context} : ${raw}`)
}

export class SupabaseRepository implements DataRepository {
  readonly mode = 'supabase' as const
  readonly client: SupabaseClient

  private passwordSetup = false

  constructor(url: string, anonKey: string) {
    // Lien d'invitation ou de réinitialisation : à lire avant que le client ne nettoie l'URL.
    const hash = typeof window === 'undefined' ? '' : `${window.location.hash}${window.location.search}`
    this.passwordSetup = /type=(invite|recovery)/.test(hash)
    this.client = createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
    this.client.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') this.passwordSetup = true
    })
  }

  // ----- Authentification ---------------------------------------------------

  private async profile(id: string): Promise<AppUser | null> {
    const { data, error } = await this.client.from('profiles').select('*').eq('id', id).maybeSingle<ProfileRow>()
    if (error) fail(error, 'Chargement du profil')
    return data ? toUser(data) : null
  }

  async getCurrentUser() {
    const { data } = await this.client.auth.getSession()
    if (!data.session) return null
    return this.profile(data.session.user.id)
  }

  async signInWithPassword(email: string, password: string) {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password })
    if (error) fail(error, 'Connexion')
    const profile = await this.profile(data.user.id)
    if (!profile) throw new Error('Votre compte existe mais aucun profil ne lui est associé. Contactez l’administrateur.')
    return profile
  }

  async sendMagicLink(email: string) {
    const { error } = await this.client.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin, shouldCreateUser: false } })
    if (error) fail(error, 'Envoi du lien')
  }

  async requestPasswordReset(email: string) {
    const { error } = await this.client.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin })
    if (error) fail(error, 'Réinitialisation')
  }

  async updatePassword(password: string) {
    const { error } = await this.client.auth.updateUser({ password })
    if (error) {
      if (/should be different/i.test(error.message)) throw new Error('Le nouveau mot de passe doit être différent de l’ancien.')
      if (/at least|weak|short/i.test(error.message)) throw new Error('Mot de passe trop faible : 8 caractères minimum.')
      fail(error, 'Mot de passe')
    }
    this.passwordSetup = false
  }

  consumePasswordSetupRequest() {
    const value = this.passwordSetup
    this.passwordSetup = false
    return value
  }

  async signInAsDemoUser(): Promise<AppUser> {
    throw new Error('Les profils de démonstration ne sont pas disponibles avec Supabase.')
  }

  async signOut() {
    await this.client.auth.signOut()
  }

  // ----- Référentiel ----------------------------------------------------------

  async loadSnapshot(): Promise<Snapshot> {
    const [settings, services, templates, profiles, meetings] = await Promise.all([
      this.client.from('app_settings').select('settings').eq('id', 1).maybeSingle<{ settings: AppSettings }>(),
      this.client.from('services').select('*').order('position'),
      this.client.from('slide_templates').select('*').order('position'),
      this.client.from('profiles').select('*').order('full_name'),
      this.client.from('meetings').select('*').order('iso_year', { ascending: false }).order('iso_week', { ascending: false }),
    ])
    for (const [res, label] of [
      [settings, 'Paramètres'],
      [services, 'Services'],
      [templates, 'Modèles'],
      [profiles, 'Utilisateurs'],
      [meetings, 'Réunions'],
    ] as const) {
      if (res.error) fail(res.error, `Chargement — ${label}`)
    }
    return {
      settings: { ...DEFAULT_SETTINGS, ...settings.data?.settings },
      services: ((services.data ?? []) as ServiceRow[]).map(toService),
      templates: ((templates.data ?? []) as TemplateRow[]).map(toTemplate),
      users: ((profiles.data ?? []) as ProfileRow[]).map(toUser),
      meetings: ((meetings.data ?? []) as MeetingRow[]).map(toMeeting),
    }
  }

  async saveSettings(settings: AppSettings) {
    const { error } = await this.client.from('app_settings').upsert({ id: 1, settings })
    if (error) fail(error, 'Enregistrement des paramètres')
  }

  async saveService(service: Service) {
    const { error } = await this.client.from('services').upsert(fromService(service))
    if (error) fail(error, 'Enregistrement du service')
  }

  async deleteService(id: string) {
    const { error } = await this.client.from('services').delete().eq('id', id)
    if (error) fail(error, 'Suppression du service')
  }

  async saveTemplates(serviceId: string, templates: SlideTemplate[]) {
    const del = await this.client.from('slide_templates').delete().eq('service_id', serviceId)
    if (del.error) fail(del.error, 'Modèles de diapositives')
    if (templates.length === 0) return
    const { error } = await this.client.from('slide_templates').insert(
      templates.map((t) => ({ id: t.id, service_id: t.serviceId, kind: t.kind, title: t.title, position: t.position, blocks: t.blocks })),
    )
    if (error) fail(error, 'Modèles de diapositives')
  }

  async saveUser(user: AppUser) {
    const { data, error } = await this.client
      .from('profiles')
      .update({ full_name: user.fullName, role: user.role, service_id: user.serviceId, job_title: user.jobTitle })
      .eq('id', user.id)
      .select('id')
    if (error) fail(error, 'Enregistrement de l’utilisateur')
    if (!data || data.length === 0) {
      throw new Error('Pour ajouter une personne, invitez-la depuis Supabase (Authentication → Users → Invite) : son profil apparaîtra ici automatiquement.')
    }
  }

  async deleteUser(): Promise<void> {
    throw new Error('La suppression d’un compte se fait depuis Supabase (Authentication → Users).')
  }

  // ----- Réunions ---------------------------------------------------------------

  async loadBundle(meetingId: string): Promise<MeetingBundle> {
    const [meeting, submissions, slides, attachments] = await Promise.all([
      this.client.from('meetings').select('*').eq('id', meetingId).single<MeetingRow>(),
      this.client.from('submissions').select('*').eq('meeting_id', meetingId),
      this.client.from('slides').select('*').eq('meeting_id', meetingId).order('position'),
      this.client.from('attachments').select('*').eq('meeting_id', meetingId).order('created_at'),
    ])
    if (meeting.error) fail(meeting.error, 'Chargement de la réunion')
    if (submissions.error) fail(submissions.error, 'Chargement des statuts')
    if (slides.error) fail(slides.error, 'Chargement des diapositives')
    if (attachments.error) fail(attachments.error, 'Chargement des pièces jointes')

    const attachmentRows = (attachments.data ?? []) as AttachmentRow[]
    let signed: Record<string, string> = {}
    if (attachmentRows.length > 0) {
      const { data } = await this.client.storage.from(ATTACHMENTS_BUCKET).createSignedUrls(
        attachmentRows.map((a) => a.storage_path),
        60 * 60,
      )
      signed = Object.fromEntries((data ?? []).map((d) => [d.path ?? '', d.signedUrl ?? '']))
    }

    return {
      meeting: toMeeting(meeting.data),
      submissions: ((submissions.data ?? []) as SubmissionRow[]).map(toSubmission),
      slides: ((slides.data ?? []) as SlideRow[]).map(toSlide),
      attachments: attachmentRows.map((a) => ({
        id: a.id,
        meetingId: a.meeting_id,
        serviceId: a.service_id,
        fileName: a.file_name,
        mimeType: a.mime_type,
        sizeBytes: a.size_bytes,
        url: signed[a.storage_path] ?? '',
        storagePath: a.storage_path,
        uploadedBy: a.uploaded_by,
        createdAt: a.created_at,
      })),
    }
  }

  async createBundle(bundle: MeetingBundle) {
    const { error } = await this.client.from('meetings').insert(fromMeeting(bundle.meeting))
    if (error) fail(error, 'Création de la réunion')
    const subs = await this.client.from('submissions').insert(bundle.submissions.map(fromSubmission))
    const slides = bundle.slides.length ? await this.client.from('slides').insert(bundle.slides.map(fromSlide)) : { error: null }
    if (subs.error || slides.error) {
      await this.client.from('meetings').delete().eq('id', bundle.meeting.id)
      fail(subs.error ?? slides.error, 'Création de la réunion')
    }
  }

  async ensureMeeting(build: () => MeetingBundle, week: { year: number; week: number }) {
    const existing = await this.client.from('meetings').select('id').eq('iso_year', week.year).eq('iso_week', week.week).maybeSingle<{ id: string }>()
    if (existing.data) return null
    try {
      const bundle = build()
      await this.createBundle(bundle)
      return bundle.meeting.id
    } catch {
      // Profil non administrateur : la fonction serveur crée la réunion (duplication de la précédente).
      const { data, error } = await this.client.rpc('ensure_meeting_for_week', { p_year: week.year, p_week: week.week })
      if (error) return null
      return (data as string | null) ?? null
    }
  }

  async saveMeeting(meeting: Meeting) {
    const { error } = await this.client.from('meetings').update(fromMeeting(meeting)).eq('id', meeting.id)
    if (error) fail(error, 'Enregistrement de la réunion')
  }

  async deleteMeeting(id: string) {
    const { error } = await this.client.from('meetings').delete().eq('id', id)
    if (error) fail(error, 'Suppression de la réunion')
  }

  async saveSubmission(submission: Submission) {
    // Mise à jour d'abord : un responsable n'a pas le droit d'insérer (RLS).
    const row = fromSubmission(submission)
    const { data, error } = await this.client.from('submissions').update(row).eq('id', submission.id).select('id')
    if (error) fail(error, 'Mise à jour du statut')
    if (!data || data.length === 0) {
      const inserted = await this.client.from('submissions').insert(row)
      if (inserted.error) fail(inserted.error, 'Mise à jour du statut')
    }
  }

  async saveSlide(slide: Slide) {
    const { error } = await this.client.from('slides').upsert(fromSlide(slide))
    if (error) fail(error, 'Enregistrement de la diapositive')
  }

  async saveSlides(slides: Slide[]) {
    if (slides.length === 0) return
    const { error } = await this.client.from('slides').upsert(slides.map(fromSlide))
    if (error) fail(error, 'Enregistrement des diapositives')
  }

  async deleteSlide(id: string) {
    const { error } = await this.client.from('slides').delete().eq('id', id)
    if (error) fail(error, 'Suppression de la diapositive')
  }

  // ----- Fichiers ------------------------------------------------------------------

  async uploadAttachment(file: File, ctx: UploadContext): Promise<Attachment> {
    const id = uid()
    const path = `${ctx.meetingId}/${ctx.serviceId}/${id}-${file.name.replace(/[^\w.-]+/g, '_')}`
    const up = await this.client.storage.from(ATTACHMENTS_BUCKET).upload(path, file, { contentType: file.type || undefined })
    if (up.error) fail(up.error, 'Envoi du fichier')
    const { data: session } = await this.client.auth.getSession()
    const row: AttachmentRow = {
      id,
      meeting_id: ctx.meetingId,
      service_id: ctx.serviceId,
      file_name: file.name,
      mime_type: file.type || 'application/octet-stream',
      size_bytes: file.size,
      storage_path: path,
      uploaded_by: session.session?.user.id ?? null,
      created_at: new Date().toISOString(),
    }
    const { error } = await this.client.from('attachments').insert(row)
    if (error) {
      await this.client.storage.from(ATTACHMENTS_BUCKET).remove([path])
      fail(error, 'Enregistrement de la pièce jointe')
    }
    const signed = await this.client.storage.from(ATTACHMENTS_BUCKET).createSignedUrl(path, 3600)
    return {
      id,
      meetingId: ctx.meetingId,
      serviceId: ctx.serviceId,
      fileName: row.file_name,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
      url: signed.data?.signedUrl ?? '',
      storagePath: path,
      uploadedBy: row.uploaded_by,
      createdAt: row.created_at,
    }
  }

  async deleteAttachment(attachment: Attachment) {
    if (attachment.storagePath) await this.client.storage.from(ATTACHMENTS_BUCKET).remove([attachment.storagePath])
    const { error } = await this.client.from('attachments').delete().eq('id', attachment.id)
    if (error) fail(error, 'Suppression de la pièce jointe')
  }

  async uploadImage(file: File, ctx: UploadContext): Promise<string> {
    const blob = await compressImage(file, 1800, 0.85)
    const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/svg+xml' ? 'svg' : 'jpg'
    const path = `${ctx.meetingId}/${ctx.serviceId}/${uid()}.${ext}`
    const { error } = await this.client.storage.from(IMAGES_BUCKET).upload(path, blob, { contentType: blob.type || 'image/jpeg' })
    if (error) fail(error, 'Envoi de l’image')
    return this.client.storage.from(IMAGES_BUCKET).getPublicUrl(path).data.publicUrl
  }

  subscribe(meetingId: string | null, onChange: () => void) {
    const channel = this.client.channel(`flash-synchro-${meetingId ?? 'all'}-${uid().slice(0, 8)}`)
    const tables = meetingId ? (['slides', 'submissions', 'attachments'] as const) : ([] as const)
    for (const table of tables) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `meeting_id=eq.${meetingId}` }, onChange)
    }
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'meetings' }, onChange)
    channel.subscribe()
    return () => {
      void this.client.removeChannel(channel)
    }
  }
}
