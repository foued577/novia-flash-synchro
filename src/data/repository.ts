import type {
  AppSettings,
  AppUser,
  Attachment,
  Meeting,
  MeetingBundle,
  Service,
  Slide,
  SlideTemplate,
  Snapshot,
  Submission,
} from '@/domain/types'

// ---------------------------------------------------------------------------
// Contrat d'accès aux données.
// Deux implémentations : DemoRepository (navigateur) et SupabaseRepository.
// L'interface graphique ne dépend que de ce contrat.
// ---------------------------------------------------------------------------

export interface UploadContext {
  meetingId: string
  serviceId: string
}

export interface DataRepository {
  readonly mode: 'demo' | 'supabase'

  // Authentification
  getCurrentUser(): Promise<AppUser | null>
  signInWithPassword(email: string, password: string): Promise<AppUser>
  sendMagicLink(email: string): Promise<void>
  signInAsDemoUser(userId: string): Promise<AppUser>
  signOut(): Promise<void>

  // Référentiel
  loadSnapshot(): Promise<Snapshot>
  saveSettings(settings: AppSettings): Promise<void>
  saveService(service: Service): Promise<void>
  deleteService(id: string): Promise<void>
  saveTemplates(serviceId: string, templates: SlideTemplate[]): Promise<void>
  saveUser(user: AppUser): Promise<void>
  deleteUser(id: string): Promise<void>

  // Réunions
  loadBundle(meetingId: string): Promise<MeetingBundle>
  createBundle(bundle: MeetingBundle): Promise<void>
  /** Crée la réunion d'une semaine si elle n'existe pas (création automatique hebdomadaire). */
  ensureMeeting(build: () => MeetingBundle, week: { year: number; week: number }): Promise<string | null>
  saveMeeting(meeting: Meeting): Promise<void>
  deleteMeeting(id: string): Promise<void>
  saveSubmission(submission: Submission): Promise<void>
  saveSlide(slide: Slide): Promise<void>
  saveSlides(slides: Slide[]): Promise<void>
  deleteSlide(id: string): Promise<void>

  // Fichiers
  uploadAttachment(file: File, ctx: UploadContext): Promise<Attachment>
  deleteAttachment(attachment: Attachment): Promise<void>
  /** Téléverse une image de diapositive et renvoie son URL. */
  uploadImage(file: File, ctx: UploadContext): Promise<string>

  /** Abonnement aux modifications d'une réunion (temps réel / autres onglets). */
  subscribe(meetingId: string | null, onChange: () => void): () => void

  // Outils du mode démonstration
  resetDemo?(): Promise<void>
  exportData?(): Promise<string>
  importData?(json: string): Promise<void>
}
