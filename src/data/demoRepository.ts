import type { AppUser, Attachment, MeetingBundle, NewUserInput, Slide, Snapshot } from '@/domain/types'
import { compressImage, readAsDataUrl } from '@/lib/files'
import { nowIso, uid } from '@/lib/ids'
import { generateDemoData } from './demoSeed'
import type { DataRepository, UploadContext } from './repository'

// ---------------------------------------------------------------------------
// Mode démonstration : toutes les données vivent dans le navigateur
// (localStorage). Les autres onglets sont synchronisés en direct, ce qui permet
// d'éditer dans une fenêtre et de présenter dans une autre.
// ---------------------------------------------------------------------------

const DB_KEY = 'novia-flash-synchro:demo:v1'
const SESSION_KEY = 'novia-flash-synchro:demo:session'
const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024

interface DemoDb {
  version: 1
  createdAt: string
  snapshot: Snapshot
  bundles: Record<string, MeetingBundle>
}

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch (error) {
    if (error instanceof DOMException && (error.name === 'QuotaExceededError' || error.code === 22)) {
      throw new Error('Le stockage du navigateur est plein : retirez quelques images ou pièces jointes, ou réinitialisez la démonstration.')
    }
  }
}

export class DemoRepository implements DataRepository {
  readonly mode = 'demo' as const
  private db: DemoDb
  private listeners = new Set<() => void>()
  private flushTimer: number | null = null

  constructor() {
    this.db = this.read() ?? this.seed()
    window.addEventListener('storage', (event) => {
      if (event.key !== DB_KEY || !event.newValue) return
      try {
        this.db = JSON.parse(event.newValue) as DemoDb
        this.listeners.forEach((fn) => fn())
      } catch {
        /* ignoré : écriture partielle d'un autre onglet */
      }
    })
    window.addEventListener('beforeunload', () => this.flush())
  }

  private read(): DemoDb | null {
    const raw = safeGet(DB_KEY)
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw) as DemoDb
      return parsed.version === 1 && parsed.snapshot ? parsed : null
    } catch {
      return null
    }
  }

  private seed(): DemoDb {
    const data = generateDemoData()
    const db: DemoDb = { version: 1, createdAt: nowIso(), snapshot: data.snapshot, bundles: data.bundles }
    safeSet(DB_KEY, JSON.stringify(db))
    return db
  }

  /** Écriture différée (frappe au clavier) : regroupe les sauvegardes. */
  private persist(immediate = false) {
    if (this.flushTimer) window.clearTimeout(this.flushTimer)
    if (immediate) return this.flush()
    this.flushTimer = window.setTimeout(() => this.flush(), 250)
  }

  private flush() {
    if (this.flushTimer) window.clearTimeout(this.flushTimer)
    this.flushTimer = null
    safeSet(DB_KEY, JSON.stringify(this.db))
  }

  private bundle(meetingId: string): MeetingBundle {
    const b = this.db.bundles[meetingId]
    if (!b) throw new Error('Réunion introuvable')
    return b
  }

  // ----- Authentification ---------------------------------------------------

  async getCurrentUser(): Promise<AppUser | null> {
    const id = safeGet(SESSION_KEY)
    return this.db.snapshot.users.find((u) => u.id === id) ?? null
  }

  async signInWithPassword(email: string): Promise<AppUser> {
    const user = this.db.snapshot.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase())
    if (!user) throw new Error('Aucun profil de démonstration ne correspond à cette adresse.')
    safeSet(SESSION_KEY, user.id)
    return user
  }

  async sendMagicLink(): Promise<void> {
    throw new Error('Le lien de connexion par e-mail est disponible une fois Supabase connecté.')
  }

  async requestPasswordReset(): Promise<void> {
    throw new Error('La réinitialisation du mot de passe est disponible une fois Supabase connecté.')
  }

  async updatePassword(): Promise<void> {
    throw new Error('Les mots de passe sont gérés par Supabase : indisponible en démonstration.')
  }

  consumePasswordSetupRequest() {
    return false
  }

  async signInAsDemoUser(userId: string): Promise<AppUser> {
    const user = this.db.snapshot.users.find((u) => u.id === userId)
    if (!user) throw new Error('Profil introuvable')
    safeSet(SESSION_KEY, user.id)
    return user
  }

  async signOut(): Promise<void> {
    try {
      window.localStorage.removeItem(SESSION_KEY)
    } catch {
      /* stockage indisponible */
    }
  }

  // ----- Référentiel ----------------------------------------------------------

  async loadSnapshot(): Promise<Snapshot> {
    return structuredClone(this.db.snapshot)
  }

  async saveSettings(settings: Snapshot['settings']) {
    this.db.snapshot.settings = structuredClone(settings)
    this.persist(true)
  }

  async saveService(service: Snapshot['services'][number]) {
    const list = this.db.snapshot.services
    const i = list.findIndex((s) => s.id === service.id)
    if (i >= 0) list[i] = structuredClone(service)
    else list.push(structuredClone(service))
    this.persist(true)
  }

  async deleteService(id: string) {
    this.db.snapshot.services = this.db.snapshot.services.filter((s) => s.id !== id)
    this.db.snapshot.templates = this.db.snapshot.templates.filter((t) => t.serviceId !== id)
    this.persist(true)
  }

  async saveTemplates(serviceId: string, templates: Snapshot['templates']) {
    this.db.snapshot.templates = [...this.db.snapshot.templates.filter((t) => t.serviceId !== serviceId), ...structuredClone(templates)]
    this.persist(true)
  }

  async saveUser(user: AppUser) {
    const list = this.db.snapshot.users
    const i = list.findIndex((u) => u.id === user.id)
    if (i >= 0) list[i] = { ...user }
    else list.push({ ...user })
    this.persist(true)
  }

  async createUser(input: NewUserInput) {
    const email = input.email.trim().toLowerCase()
    if (this.db.snapshot.users.some((u) => u.email.toLowerCase() === email)) throw new Error('Un compte existe déjà pour cette adresse.')
    const user: AppUser = { id: uid(), email, fullName: input.fullName.trim(), jobTitle: input.jobTitle.trim(), role: input.role, serviceId: input.role === 'manager' ? input.serviceId : null }
    this.db.snapshot.users.push(user)
    this.persist(true)
    return { user, password: input.mode === 'password' ? 'demo-1234' : null }
  }

  async resetUserPassword() {
    return 'demo-1234'
  }

  async deleteUser(id: string) {
    this.db.snapshot.users = this.db.snapshot.users.filter((u) => u.id !== id)
    this.db.snapshot.services = this.db.snapshot.services.map((s) => (s.managerId === id ? { ...s, managerId: null } : s))
    this.persist(true)
  }

  // ----- Réunions ---------------------------------------------------------------

  async loadBundle(meetingId: string): Promise<MeetingBundle> {
    return structuredClone(this.bundle(meetingId))
  }

  async createBundle(bundle: MeetingBundle) {
    this.db.bundles[bundle.meeting.id] = structuredClone(bundle)
    this.db.snapshot.meetings = [...this.db.snapshot.meetings.filter((m) => m.id !== bundle.meeting.id), structuredClone(bundle.meeting)]
    this.persist(true)
  }

  async ensureMeeting(build: () => MeetingBundle, week: { year: number; week: number }) {
    const exists = this.db.snapshot.meetings.some((m) => m.isoYear === week.year && m.isoWeek === week.week)
    if (exists) return null
    const bundle = build()
    await this.createBundle(bundle)
    return bundle.meeting.id
  }

  async saveMeeting(meeting: MeetingBundle['meeting']) {
    const b = this.bundle(meeting.id)
    b.meeting = structuredClone(meeting)
    this.db.snapshot.meetings = this.db.snapshot.meetings.map((m) => (m.id === meeting.id ? structuredClone(meeting) : m))
    this.persist(true)
  }

  async deleteMeeting(id: string) {
    delete this.db.bundles[id]
    this.db.snapshot.meetings = this.db.snapshot.meetings.filter((m) => m.id !== id)
    this.persist(true)
  }

  async saveSubmission(submission: MeetingBundle['submissions'][number]) {
    const b = this.bundle(submission.meetingId)
    const i = b.submissions.findIndex((s) => s.id === submission.id)
    if (i >= 0) b.submissions[i] = { ...submission }
    else b.submissions.push({ ...submission })
    this.persist(true)
  }

  async saveSlide(slide: Slide) {
    const b = this.bundle(slide.meetingId)
    const i = b.slides.findIndex((s) => s.id === slide.id)
    if (i >= 0) b.slides[i] = structuredClone(slide)
    else b.slides.push(structuredClone(slide))
    this.persist()
  }

  async saveSlides(slides: Slide[]) {
    for (const slide of slides) await this.saveSlide(slide)
    this.persist(true)
  }

  async deleteSlide(id: string) {
    for (const b of Object.values(this.db.bundles)) {
      if (b.slides.some((s) => s.id === id)) b.slides = b.slides.filter((s) => s.id !== id)
    }
    this.persist(true)
  }

  // ----- Fichiers ------------------------------------------------------------------

  async uploadAttachment(file: File, ctx: UploadContext): Promise<Attachment> {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      throw new Error('En mode démonstration, les pièces jointes sont limitées à 2 Mo. Connectez Supabase pour des fichiers plus lourds.')
    }
    const attachment: Attachment = {
      id: uid(),
      meetingId: ctx.meetingId,
      serviceId: ctx.serviceId,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      url: await readAsDataUrl(file),
      storagePath: null,
      uploadedBy: safeGet(SESSION_KEY),
      createdAt: nowIso(),
    }
    this.bundle(ctx.meetingId).attachments.push(attachment)
    this.persist(true)
    return attachment
  }

  async deleteAttachment(attachment: Attachment) {
    const b = this.bundle(attachment.meetingId)
    b.attachments = b.attachments.filter((a) => a.id !== attachment.id)
    this.persist(true)
  }

  async uploadImage(file: File): Promise<string> {
    const blob = await compressImage(file, 1600, 0.82)
    if (blob.size > MAX_ATTACHMENT_BYTES) throw new Error('Image trop lourde pour le mode démonstration (2 Mo maximum après compression).')
    return readAsDataUrl(blob)
  }

  subscribe(_meetingId: string | null, onChange: () => void) {
    this.listeners.add(onChange)
    return () => {
      this.listeners.delete(onChange)
    }
  }

  // ----- Outils de démonstration -------------------------------------------------

  async resetDemo() {
    this.db = this.seed()
  }

  async exportData() {
    this.flush()
    return JSON.stringify(this.db, null, 2)
  }

  async importData(json: string) {
    const parsed = JSON.parse(json) as DemoDb
    if (parsed.version !== 1 || !parsed.snapshot || !parsed.bundles) throw new Error('Fichier de sauvegarde non reconnu.')
    this.db = parsed
    this.persist(true)
  }
}
