import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

// ---------------------------------------------------------------------------
// Chronomètre de réunion : un compte à rebours par service + un chronomètre
// global. Basé sur des horodatages (précis même si l'onglet est ralenti) et
// conservé dans la session de l'onglet (un rechargement ne perd rien).
// ---------------------------------------------------------------------------

interface TimerState {
  meetingId: string | null
  running: boolean
  lastTick: number | null
  globalMs: number
  serviceMs: Record<string, number>
  activeServiceId: string | null
  startedAt: number | null

  attach(meetingId: string, firstServiceId: string | null): void
  start(): void
  pause(): void
  toggle(): void
  tick(now?: number): void
  setActive(serviceId: string | null): void
  resetService(serviceId?: string): void
  resetAll(): void
}

const safeSession = createJSONStorage(() => {
  try {
    return window.sessionStorage
  } catch {
    return { getItem: () => null, setItem: () => undefined, removeItem: () => undefined }
  }
})

export const useTimerStore = create<TimerState>()(
  persist(
    (set, get) => ({
      meetingId: null,
      running: false,
      lastTick: null,
      globalMs: 0,
      serviceMs: {},
      activeServiceId: null,
      startedAt: null,

      attach(meetingId, firstServiceId) {
        if (get().meetingId === meetingId) {
          if (!get().activeServiceId) set({ activeServiceId: firstServiceId })
          return
        }
        set({ meetingId, running: false, lastTick: null, globalMs: 0, serviceMs: {}, activeServiceId: firstServiceId, startedAt: null })
      },

      start() {
        if (get().running) return
        set({ running: true, lastTick: Date.now(), startedAt: get().startedAt ?? Date.now() })
      },

      pause() {
        if (!get().running) return
        get().tick()
        set({ running: false, lastTick: null })
      },

      toggle() {
        if (get().running) get().pause()
        else get().start()
      },

      tick(now = Date.now()) {
        const { running, lastTick, activeServiceId, serviceMs, globalMs } = get()
        if (!running || lastTick === null) return
        const delta = Math.max(0, now - lastTick)
        set({
          lastTick: now,
          globalMs: globalMs + delta,
          serviceMs: activeServiceId ? { ...serviceMs, [activeServiceId]: (serviceMs[activeServiceId] ?? 0) + delta } : serviceMs,
        })
      },

      setActive(serviceId) {
        if (serviceId === get().activeServiceId) return
        get().tick()
        set({ activeServiceId: serviceId })
      },

      resetService(serviceId) {
        const id = serviceId ?? get().activeServiceId
        if (!id) return
        get().tick()
        set({ serviceMs: { ...get().serviceMs, [id]: 0 } })
      },

      resetAll() {
        set({ running: false, lastTick: null, globalMs: 0, serviceMs: {}, startedAt: null })
      },
    }),
    {
      name: 'novia-flash-synchro:timer',
      storage: safeSession,
      partialize: (s) => ({
        meetingId: s.meetingId,
        running: s.running,
        lastTick: s.lastTick,
        globalMs: s.globalMs,
        serviceMs: s.serviceMs,
        activeServiceId: s.activeServiceId,
        startedAt: s.startedAt,
      }),
    },
  ),
)
