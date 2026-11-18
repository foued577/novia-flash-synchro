import { toast } from 'sonner'
import { create } from 'zustand'
import { getRepository } from '@/data'
import { blankSubmission, buildMeetingBundle } from '@/domain/meetingFactory'
import { nowTimeInParis, todayInParis, type IsoWeekRef } from '@/domain/isoWeek'
import { findMeetingForWeek, sortMeetingsDesc, targetMeetingWeek } from '@/domain/selectors'
import type {
  AppSettings,
  AppUser,
  NewUserInput,
  Attachment,
  Meeting,
  MeetingBundle,
  Service,
  Slide,
  SlideKind,
  SlideTemplate,
  Snapshot,
  Submission,
  SubmissionStatus,
} from '@/domain/types'
import { nowIso, uid } from '@/lib/ids'

// ---------------------------------------------------------------------------
// État applicatif central (zustand).
// Mises à jour optimistes : l'interface réagit immédiatement, la persistance
// (navigateur ou Supabase) suit en arrière-plan.
// ---------------------------------------------------------------------------

type LoadState = 'idle' | 'loading' | 'ready' | 'error'

interface AppState {
  status: LoadState
  error: string | null
  user: AppUser | null
  snapshot: Snapshot | null
  bundles: Record<string, MeetingBundle>
  today: string
  nowTime: string
  saving: number
  lastSavedAt: number | null

  init(): Promise<void>
  refresh(): Promise<void>
  tick(): void
  loadBundle(meetingId: string, force?: boolean): Promise<MeetingBundle | null>
  ensureBundles(ids: string[]): Promise<void>

  signInAsDemoUser(id: string): Promise<void>
  signInWithPassword(email: string, password: string): Promise<void>
  sendMagicLink(email: string): Promise<void>
  signOut(): Promise<void>
  /** Ouvre la fenêtre « Définir mon mot de passe » (invitation, réinitialisation, changement). */
  passwordDialog: 'setup' | 'change' | null
  setPasswordDialog(mode: 'setup' | 'change' | null): void
  requestPasswordReset(email: string): Promise<void>
  updatePassword(password: string): Promise<void>

  createMeeting(opts: { week: IsoWeekRef; reviewWeeks: number; meetingDate?: string; meetingTime?: string; sourceId: string | null }): Promise<string>
  updateMeeting(id: string, patch: Partial<Meeting>): Promise<void>
  deleteMeeting(id: string): Promise<void>
  setSubmissionStatus(meetingId: string, serviceId: string, status: SubmissionStatus, comment?: string): Promise<void>

  updateSlide(slide: Slide): void
  addSlide(meetingId: string, serviceId: string, kind: SlideKind, title?: string): Promise<Slide>
  duplicateSlide(meetingId: string, slideId: string): Promise<void>
  deleteSlide(meetingId: string, slideId: string): Promise<void>
  moveSlide(meetingId: string, slideId: string, direction: -1 | 1): Promise<void>

  uploadAttachment(file: File, meetingId: string, serviceId: string): Promise<void>
  deleteAttachment(attachment: Attachment): Promise<void>
  uploadImage(file: File, meetingId: string, serviceId: string): Promise<string>

  saveSettings(settings: AppSettings): Promise<void>
  saveService(service: Service): Promise<void>
  deleteService(id: string): Promise<void>
  saveTemplates(serviceId: string, templates: SlideTemplate[]): Promise<void>
  saveUser(user: AppUser): Promise<void>
  deleteUser(id: string): Promise<void>
  createUser(input: NewUserInput): Promise<{ user: AppUser; password: string | null }>
  resetUserPassword(id: string): Promise<string>
  resetDemo(): Promise<void>
}

const repo = () => getRepository()
const slideTimers = new Map<string, number>()
const pendingSlides = new Map<string, Slide>()

function notifyError(error: unknown, fallback = 'Une erreur est survenue') {
  const message = error instanceof Error ? error.message : fallback
  toast.error(message)
}

export const useAppStore = create<AppState>((set, get) => {
  /** Applique une transformation à une réunion chargée. */
  const patchBundle = (meetingId: string, fn: (b: MeetingBundle) => MeetingBundle) => {
    const bundle = get().bundles[meetingId]
    if (!bundle) return
    set({ bundles: { ...get().bundles, [meetingId]: fn(bundle) } })
  }

  const track = async <T,>(work: () => Promise<T>): Promise<T> => {
    set({ saving: get().saving + 1 })
    try {
      const result = await work()
      set({ lastSavedAt: Date.now() })
      return result
    } finally {
      set({ saving: Math.max(0, get().saving - 1) })
    }
  }

  const replaceMeetingInSnapshot = (meeting: Meeting) => {
    const snapshot = get().snapshot
    if (!snapshot) return
    const exists = snapshot.meetings.some((m) => m.id === meeting.id)
    set({
      snapshot: {
        ...snapshot,
        meetings: exists ? snapshot.meetings.map((m) => (m.id === meeting.id ? meeting : m)) : [...snapshot.meetings, meeting],
      },
    })
  }

  /** Création automatique de la réunion de la semaine (si activée). */
  const autoCreate = async () => {
    const { snapshot, user, today, nowTime } = get()
    if (!snapshot || !user || !snapshot.settings.autoCreateWeeklyMeeting) return
    const target = targetMeetingWeek(snapshot.settings, today, nowTime)
    if (findMeetingForWeek(snapshot.meetings, target)) return
    const latest = sortMeetingsDesc(snapshot.meetings)[0]
    const source = latest ? await get().loadBundle(latest.id) : null
    const id = await repo().ensureMeeting(
      () => buildMeetingBundle({ week: target, settings: snapshot.settings, services: snapshot.services, templates: snapshot.templates, source, createdBy: user.id }),
      target,
    )
    if (id) {
      await get().refresh()
      toast.success(`La Flash Synchro de la semaine ${target.week} a été créée automatiquement.`)
    }
  }

  return {
    status: 'idle',
    error: null,
    passwordDialog: null,
    user: null,
    snapshot: null,
    bundles: {},
    today: todayInParis(),
    nowTime: nowTimeInParis(),
    saving: 0,
    lastSavedAt: null,

    async init() {
      if (get().status === 'loading' || get().status === 'ready') return
      set({ status: 'loading', error: null })
      try {
        const [user, snapshot] = await Promise.all([repo().getCurrentUser(), repo().loadSnapshot().catch(() => null)])
        set({ user, snapshot, status: 'ready', passwordDialog: user && repo().consumePasswordSetupRequest() ? 'setup' : null })
        if (user && !snapshot) await get().refresh()
        if (user) await autoCreate().catch(() => undefined)
        // Synchronisation : autres onglets (démo) ou temps réel (Supabase).
        repo().subscribe(null, () => {
          void get().refresh()
          for (const id of Object.keys(get().bundles)) {
            const hasPending = [...pendingSlides.values()].some((s) => s.meetingId === id)
            if (!hasPending) void get().loadBundle(id, true)
          }
        })
      } catch (error) {
        set({ status: 'error', error: error instanceof Error ? error.message : 'Chargement impossible' })
      }
    },

    async refresh() {
      try {
        const snapshot = await repo().loadSnapshot()
        set({ snapshot })
      } catch (error) {
        notifyError(error)
      }
    },

    tick() {
      const today = todayInParis()
      const nowTime = nowTimeInParis()
      if (today !== get().today || nowTime !== get().nowTime) set({ today, nowTime })
    },

    async loadBundle(meetingId, force = false) {
      const cached = get().bundles[meetingId]
      if (cached && !force) return cached
      try {
        const bundle = await repo().loadBundle(meetingId)
        set({ bundles: { ...get().bundles, [meetingId]: bundle } })
        return bundle
      } catch (error) {
        if (!cached) notifyError(error)
        return cached ?? null
      }
    },

    async ensureBundles(ids) {
      const missing = ids.filter((id) => !get().bundles[id])
      if (missing.length === 0) return
      const loaded = await Promise.all(missing.map((id) => repo().loadBundle(id).catch(() => null)))
      const next = { ...get().bundles }
      loaded.forEach((b) => {
        if (b) next[b.meeting.id] = b
      })
      set({ bundles: next })
    },

    // ----- Session ----------------------------------------------------------------

    async signInAsDemoUser(id) {
      const user = await repo().signInAsDemoUser(id)
      set({ user })
      if (!get().snapshot) await get().refresh()
      await autoCreate().catch(() => undefined)
    },

    async signInWithPassword(email, password) {
      const user = await repo().signInWithPassword(email, password)
      set({ user, passwordDialog: repo().consumePasswordSetupRequest() ? 'setup' : null })
      await get().refresh()
      await autoCreate().catch(() => undefined)
    },

    async sendMagicLink(email) {
      await repo().sendMagicLink(email)
    },

    setPasswordDialog(mode) {
      set({ passwordDialog: mode })
    },

    async requestPasswordReset(email) {
      await repo().requestPasswordReset(email)
    },

    async updatePassword(password) {
      await repo().updatePassword(password)
      set({ passwordDialog: null })
    },

    async signOut() {
      await repo().signOut()
      set({ user: null })
    },

    // ----- Réunions ---------------------------------------------------------------

    async createMeeting({ week, reviewWeeks, meetingDate, meetingTime, sourceId }) {
      const { snapshot, user } = get()
      if (!snapshot) throw new Error('Données non chargées')
      if (findMeetingForWeek(snapshot.meetings, week)) throw new Error(`Une Flash Synchro existe déjà pour la semaine ${week.week}.`)
      const source = sourceId ? await get().loadBundle(sourceId) : null
      const bundle = buildMeetingBundle({
        week,
        settings: snapshot.settings,
        services: snapshot.services,
        templates: snapshot.templates,
        source,
        reviewWeeks,
        meetingDate,
        meetingTime,
        createdBy: user?.id ?? null,
      })
      await track(() => repo().createBundle(bundle))
      set({ bundles: { ...get().bundles, [bundle.meeting.id]: bundle } })
      replaceMeetingInSnapshot(bundle.meeting)
      return bundle.meeting.id
    },

    async updateMeeting(id, patch) {
      const bundle = get().bundles[id] ?? (await get().loadBundle(id))
      if (!bundle) return
      const meeting: Meeting = { ...bundle.meeting, ...patch, updatedAt: nowIso() }
      // Ajout d'un participant : on crée son statut et ses diapositives à partir des modèles.
      const added = meeting.participants.filter((p) => !bundle.submissions.some((s) => s.serviceId === p))
      const newSubs = added.map((serviceId) => blankSubmission(id, serviceId))
      const snapshot = get().snapshot
      const newSlides: Slide[] = []
      if (snapshot) {
        for (const serviceId of added) {
          if (bundle.slides.some((s) => s.serviceId === serviceId)) continue
          snapshot.templates
            .filter((t) => t.serviceId === serviceId)
            .sort((a, b) => a.position - b.position)
            .forEach((t, index) =>
              newSlides.push({ id: uid(), meetingId: id, serviceId, kind: t.kind, title: t.title, subtitle: '', position: index, hidden: false, blocks: structuredClone(t.blocks), notes: '', updatedAt: nowIso() }),
            )
          if (meeting.durations[serviceId] === undefined) {
            meeting.durations = { ...meeting.durations, [serviceId]: snapshot.services.find((s) => s.id === serviceId)?.durationMinutes ?? 5 }
          }
        }
      }
      patchBundle(id, (b) => ({ ...b, meeting, submissions: [...b.submissions, ...newSubs], slides: [...b.slides, ...newSlides] }))
      replaceMeetingInSnapshot(meeting)
      try {
        await track(async () => {
          await repo().saveMeeting(meeting)
          for (const s of newSubs) await repo().saveSubmission(s)
          if (newSlides.length) await repo().saveSlides(newSlides)
        })
      } catch (error) {
        notifyError(error)
      }
    },

    async deleteMeeting(id) {
      await track(() => repo().deleteMeeting(id))
      const { [id]: _removed, ...rest } = get().bundles
      void _removed
      const snapshot = get().snapshot
      set({ bundles: rest, snapshot: snapshot ? { ...snapshot, meetings: snapshot.meetings.filter((m) => m.id !== id) } : snapshot })
    },

    async setSubmissionStatus(meetingId, serviceId, status, comment) {
      const bundle = get().bundles[meetingId]
      if (!bundle) return
      const user = get().user
      const current = bundle.submissions.find((s) => s.serviceId === serviceId) ?? blankSubmission(meetingId, serviceId)
      const stamp = nowIso()
      const next: Submission = {
        ...current,
        status,
        comment: comment ?? current.comment,
        updatedAt: stamp,
        updatedBy: user?.id ?? null,
        submittedAt: status === 'submitted' ? stamp : status === 'validated' ? current.submittedAt ?? stamp : status === 'in_progress' || status === 'draft' ? null : current.submittedAt,
        validatedAt: status === 'validated' ? stamp : null,
        validatedBy: status === 'validated' ? user?.id ?? null : null,
      }
      patchBundle(meetingId, (b) => ({
        ...b,
        submissions: b.submissions.some((s) => s.id === next.id) ? b.submissions.map((s) => (s.id === next.id ? next : s)) : [...b.submissions, next],
      }))
      try {
        await track(() => repo().saveSubmission(next))
      } catch (error) {
        notifyError(error)
        patchBundle(meetingId, (b) => ({ ...b, submissions: b.submissions.map((s) => (s.id === current.id ? current : s)) }))
      }
    },

    // ----- Diapositives -----------------------------------------------------------

    updateSlide(slide) {
      const updated = { ...slide, updatedAt: nowIso() }
      patchBundle(slide.meetingId, (b) => ({ ...b, slides: b.slides.map((s) => (s.id === slide.id ? updated : s)) }))
      // Première modification : le service passe de « Brouillon » à « En cours ».
      const bundle = get().bundles[slide.meetingId]
      const sub = bundle?.submissions.find((s) => s.serviceId === slide.serviceId)
      if (sub && sub.status === 'draft') void get().setSubmissionStatus(slide.meetingId, slide.serviceId, 'in_progress')

      pendingSlides.set(slide.id, updated)
      const existing = slideTimers.get(slide.id)
      if (existing) window.clearTimeout(existing)
      set({ saving: get().saving + (existing ? 0 : 1) })
      slideTimers.set(
        slide.id,
        window.setTimeout(async () => {
          slideTimers.delete(slide.id)
          const latest = pendingSlides.get(slide.id)
          pendingSlides.delete(slide.id)
          try {
            if (latest) await repo().saveSlide(latest)
            set({ lastSavedAt: Date.now() })
          } catch (error) {
            notifyError(error)
          } finally {
            set({ saving: Math.max(0, get().saving - 1) })
          }
        }, 450),
      )
    },

    async addSlide(meetingId, serviceId, kind, title = '') {
      const bundle = get().bundles[meetingId]
      const position = bundle ? bundle.slides.filter((s) => s.serviceId === serviceId).length : 0
      const slide: Slide = { id: uid(), meetingId, serviceId, kind, title, subtitle: '', position, hidden: false, blocks: [], notes: '', updatedAt: nowIso() }
      patchBundle(meetingId, (b) => ({ ...b, slides: [...b.slides, slide] }))
      try {
        await track(() => repo().saveSlide(slide))
      } catch (error) {
        notifyError(error)
      }
      return slide
    },

    async duplicateSlide(meetingId, slideId) {
      const bundle = get().bundles[meetingId]
      const source = bundle?.slides.find((s) => s.id === slideId)
      if (!bundle || !source) return
      const siblings = bundle.slides.filter((s) => s.serviceId === source.serviceId).sort((a, b) => a.position - b.position)
      const copy: Slide = { ...structuredClone(source), id: uid(), title: `${source.title || ''}`.trim(), position: source.position + 1, updatedAt: nowIso() }
      const reordered = siblings.flatMap((s) => (s.id === source.id ? [s, copy] : [s])).map((s, i) => ({ ...s, position: i }))
      patchBundle(meetingId, (b) => ({ ...b, slides: [...b.slides.filter((s) => s.serviceId !== source.serviceId), ...reordered] }))
      await track(() => repo().saveSlides(reordered))
    },

    async deleteSlide(meetingId, slideId) {
      const bundle = get().bundles[meetingId]
      const slide = bundle?.slides.find((s) => s.id === slideId)
      if (!bundle || !slide) return
      const remaining = bundle.slides
        .filter((s) => s.serviceId === slide.serviceId && s.id !== slideId)
        .sort((a, b) => a.position - b.position)
        .map((s, i) => ({ ...s, position: i }))
      patchBundle(meetingId, (b) => ({ ...b, slides: [...b.slides.filter((s) => s.serviceId !== slide.serviceId), ...remaining] }))
      try {
        await track(async () => {
          await repo().deleteSlide(slideId)
          await repo().saveSlides(remaining)
        })
      } catch (error) {
        notifyError(error)
      }
    },

    async moveSlide(meetingId, slideId, direction) {
      const bundle = get().bundles[meetingId]
      const slide = bundle?.slides.find((s) => s.id === slideId)
      if (!bundle || !slide) return
      const siblings = bundle.slides.filter((s) => s.serviceId === slide.serviceId).sort((a, b) => a.position - b.position)
      const index = siblings.findIndex((s) => s.id === slideId)
      const target = index + direction
      if (target < 0 || target >= siblings.length) return
      const swapped = [...siblings]
      ;[swapped[index], swapped[target]] = [swapped[target], swapped[index]]
      const reordered = swapped.map((s, i) => ({ ...s, position: i }))
      patchBundle(meetingId, (b) => ({ ...b, slides: [...b.slides.filter((s) => s.serviceId !== slide.serviceId), ...reordered] }))
      try {
        await track(() => repo().saveSlides(reordered))
      } catch (error) {
        notifyError(error)
      }
    },

    // ----- Fichiers ------------------------------------------------------------------

    async uploadAttachment(file, meetingId, serviceId) {
      try {
        const attachment = await track(() => repo().uploadAttachment(file, { meetingId, serviceId }))
        patchBundle(meetingId, (b) => ({ ...b, attachments: [...b.attachments, attachment] }))
        toast.success(`« ${file.name} » ajouté`)
      } catch (error) {
        notifyError(error)
      }
    },

    async deleteAttachment(attachment) {
      patchBundle(attachment.meetingId, (b) => ({ ...b, attachments: b.attachments.filter((a) => a.id !== attachment.id) }))
      try {
        await track(() => repo().deleteAttachment(attachment))
      } catch (error) {
        notifyError(error)
      }
    },

    async uploadImage(file, meetingId, serviceId) {
      return track(() => repo().uploadImage(file, { meetingId, serviceId }))
    },

    // ----- Paramètres ----------------------------------------------------------------

    async saveSettings(settings) {
      const snapshot = get().snapshot
      if (snapshot) set({ snapshot: { ...snapshot, settings } })
      try {
        await track(() => repo().saveSettings(settings))
      } catch (error) {
        notifyError(error)
      }
    },

    async saveService(service) {
      const snapshot = get().snapshot
      if (snapshot) {
        const exists = snapshot.services.some((s) => s.id === service.id)
        set({ snapshot: { ...snapshot, services: exists ? snapshot.services.map((s) => (s.id === service.id ? service : s)) : [...snapshot.services, service] } })
      }
      try {
        await track(() => repo().saveService(service))
      } catch (error) {
        notifyError(error)
      }
    },

    async deleteService(id) {
      try {
        await track(() => repo().deleteService(id))
        const snapshot = get().snapshot
        if (snapshot) set({ snapshot: { ...snapshot, services: snapshot.services.filter((s) => s.id !== id), templates: snapshot.templates.filter((t) => t.serviceId !== id) } })
      } catch (error) {
        notifyError(error)
      }
    },

    async saveTemplates(serviceId, templates) {
      const snapshot = get().snapshot
      if (snapshot) set({ snapshot: { ...snapshot, templates: [...snapshot.templates.filter((t) => t.serviceId !== serviceId), ...templates] } })
      try {
        await track(() => repo().saveTemplates(serviceId, templates))
      } catch (error) {
        notifyError(error)
      }
    },

    async saveUser(user) {
      try {
        await track(() => repo().saveUser(user))
        const snapshot = get().snapshot
        if (snapshot) {
          const exists = snapshot.users.some((u) => u.id === user.id)
          set({ snapshot: { ...snapshot, users: exists ? snapshot.users.map((u) => (u.id === user.id ? user : u)) : [...snapshot.users, user] } })
        }
        if (get().user?.id === user.id) set({ user })
      } catch (error) {
        notifyError(error)
      }
    },

    async createUser(input) {
      const result = await track(() => repo().createUser(input))
      const snapshot = get().snapshot
      if (snapshot) set({ snapshot: { ...snapshot, users: [...snapshot.users.filter((u) => u.id !== result.user.id), result.user] } })
      return result
    },

    async resetUserPassword(id) {
      return track(() => repo().resetUserPassword(id))
    },

    async deleteUser(id) {
      try {
        await track(() => repo().deleteUser(id))
        const snapshot = get().snapshot
        if (snapshot) set({ snapshot: { ...snapshot, users: snapshot.users.filter((u) => u.id !== id), services: snapshot.services.map((s) => (s.managerId === id ? { ...s, managerId: null } : s)) } })
      } catch (error) {
        notifyError(error)
      }
    },

    async resetDemo() {
      await repo().resetDemo?.()
      const snapshot = await repo().loadSnapshot()
      set({ snapshot, bundles: {} })
    },
  }
})

// Sélecteurs pratiques ---------------------------------------------------------------

export const useSnapshot = () => useAppStore((s) => s.snapshot)
export const useUser = () => useAppStore((s) => s.user)
export const useSettings = () => useAppStore((s) => s.snapshot?.settings)
