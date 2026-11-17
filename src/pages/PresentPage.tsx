import { clsx } from 'clsx'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowLeft, ArrowRight, Flag, Grid2x2, Keyboard, Maximize, Minimize, PanelBottomClose, PanelBottomOpen, X } from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { TimerCluster, TimerResetAll, useServiceTimer } from '@/components/presenter/TimerCluster'
import type { DeckRenderData } from '@/components/slides/context'
import { DeckEntryView } from '@/components/slides/DeckSlides'
import { ScaledSlide } from '@/components/slides/ScaledSlide'
import { SlideThumb } from '@/components/slides/SlideThumb'
import { useDeckData } from '@/components/slides/useDeckData'
import { Splash } from '@/components/layout/Splash'
import { serviceAt, plannedMinutes } from '@/domain/deck'
import { isAdmin } from '@/domain/permissions'
import { meetingTitle, resolveSlideTitle } from '@/domain/periods'
import { formatClock } from '@/lib/format'
import { useBundle } from '@/store/hooks'
import { useAppStore } from '@/store/useAppStore'
import { useTimerStore } from '@/store/useTimerStore'

// ---------------------------------------------------------------------------
// Mode présentation plein écran : diapositives générées, transitions,
// navigation clavier/tactile, progression par service et chronomètre.
// ---------------------------------------------------------------------------

const Stage = memo(function Stage({ data, index, direction }: { data: DeckRenderData; index: number; direction: number }) {
  const reduce = useReducedMotion()
  const entry = data.deck.entries[index]
  return (
    <ScaledSlide fit="contain" mode="present" rounded={false} className="h-full w-full">
      <AnimatePresence initial={false} custom={direction}>
        <motion.div
          key={entry?.key ?? index}
          custom={direction}
          variants={{
            enter: (d: number) => ({ opacity: 0, x: reduce ? 0 : d * 70 }),
            center: { opacity: 1, x: 0 },
            exit: (d: number) => ({ opacity: 0, x: reduce ? 0 : d * -70 }),
          }}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: reduce ? 0.01 : 0.42, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-0 bg-white"
        >
          <DeckEntryView data={data} index={index} />
        </motion.div>
      </AnimatePresence>
    </ScaledSlide>
  )
})

/** Barre fine en haut de l'écran : consommation du temps du service en cours. */
function TopTimeBar({ data, serviceId }: { data: DeckRenderData; serviceId: string | null }) {
  const service = data.services.find((s) => s.id === serviceId)
  const minutes = service ? data.meeting.durations[service.id] ?? service.durationMinutes : 0
  const { ratio, phase } = useServiceTimer(service, minutes, data.settings.warningSeconds)
  if (!service || phase === 'idle') return null
  const color = phase === 'overtime' ? '#DC2626' : phase === 'warning' ? '#FBBF24' : service.palette.accent
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 h-1.5 bg-white/5">
      <div className={clsx('h-full', phase === 'overtime' && 'animate-pulse-soft')} style={{ width: `${phase === 'overtime' ? 100 : ratio * 100}%`, background: color, transition: 'width 0.3s linear, background 0.5s' }} />
    </div>
  )
}

function ProgressRibbon({ data, index, onJump }: { data: DeckRenderData; index: number; onJump: (i: number) => void }) {
  return (
    <div className="hidden h-2.5 min-w-0 flex-1 items-stretch gap-[2px] sm:flex" aria-label={`Diapositive ${index + 1} sur ${data.deck.entries.length}`}>
      {data.deck.entries.map((entry, i) => {
        const serviceId = entry.type === 'section' || entry.type === 'service' ? entry.serviceId : null
        const service = data.services.find((s) => s.id === serviceId)
        const color = service?.palette.accent ?? '#8EAEDE'
        const label =
          entry.type === 'cover' ? 'Couverture' : entry.type === 'agenda' ? 'Ordre du jour' : entry.type === 'closing' ? 'Clôture' : entry.type === 'section' ? `${service?.name} — ouverture` : `${service?.shortName} — ${resolveSlideTitle(data.slides.find((s) => s.id === entry.slideId) ?? { kind: 'custom', title: '' }, data.periods)}`
        return (
          <button
            key={entry.key}
            onClick={() => onJump(i)}
            title={`${i + 1}. ${label}`}
            aria-label={`Aller à la diapositive ${i + 1} : ${label}`}
            className={clsx('min-w-[6px] flex-1 rounded-[2px] transition-all hover:opacity-100', i === index ? 'scale-y-[1.6] opacity-100' : i < index ? 'opacity-90' : 'opacity-30')}
            style={{ background: color }}
          />
        )
      })}
    </div>
  )
}

const SHORTCUTS: [string, string][] = [
  ['→  Espace  Page suiv.', 'Diapositive suivante'],
  ['←  Page préc.', 'Diapositive précédente'],
  ['Début / Fin', 'Première / dernière diapositive'],
  ['1 … 9', 'Aller au service n°'],
  ['N', 'Service suivant (et chronomètre)'],
  ['T', 'Démarrer / mettre en pause le chronomètre'],
  ['R', 'Réinitialiser le temps du service'],
  ['G', 'Vue d’ensemble des diapositives'],
  ['F', 'Plein écran'],
  ['B', 'Masquer / afficher la barre de contrôle'],
  ['Échap', 'Fermer / quitter la présentation'],
]

export function PresentPage() {
  const { meetingId } = useParams()
  const [search, setSearch] = useSearchParams()
  const user = useAppStore((s) => s.user)
  const updateMeeting = useAppStore((s) => s.updateMeeting)
  const bundle = useBundle(meetingId)
  const data = useDeckData(meetingId)
  const navigate = useNavigate()
  const total = data?.deck.entries.length ?? 1
  const clamp = useCallback((i: number) => Math.max(0, Math.min(total - 1, i)), [total])

  const [index, setIndex] = useState(() => Math.max(0, Number(search.get('diapo') ?? 1) - 1))
  const [direction, setDirection] = useState(1)
  const [overview, setOverview] = useState(false)
  const [help, setHelp] = useState(false)
  const [barVisible, setBarVisible] = useState(true)
  const [fullscreen, setFullscreen] = useState(!!document.fullscreenElement)
  const [ending, setEnding] = useState(false)
  const touchX = useRef<number | null>(null)

  const attach = useTimerStore((s) => s.attach)
  const running = useTimerStore((s) => s.running)
  const tick = useTimerStore((s) => s.tick)
  const setActive = useTimerStore((s) => s.setActive)
  const activeServiceId = useTimerStore((s) => s.activeServiceId)
  const toggleTimer = useTimerStore((s) => s.toggle)
  const resetService = useTimerStore((s) => s.resetService)

  // Association du chronomètre à la réunion
  useEffect(() => {
    if (data) attach(data.meeting.id, data.services[0]?.id ?? null)
  }, [data, attach])

  // Battement du chronomètre
  useEffect(() => {
    if (!running) return
    const t = window.setInterval(() => tick(), 250)
    return () => window.clearInterval(t)
  }, [running, tick])

  // L'index reste dans les bornes si le déroulé change (modification en direct)
  useEffect(() => {
    if (data && index > total - 1) setIndex(total - 1)
  }, [data, index, total])

  // Synchronisation diapositive → service chronométré
  useEffect(() => {
    if (!data || !data.settings.syncTimerWithSlides) return
    const serviceId = serviceAt(data.deck, index)
    if (serviceId) setActive(serviceId)
  }, [data, index, setActive])

  // URL partageable : ?diapo=n
  useEffect(() => {
    if (!data) return
    const current = Number(search.get('diapo') ?? 1) - 1
    if (current !== index) setSearch({ diapo: String(index + 1) }, { replace: true })
  }, [data, index, search, setSearch])

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const go = useCallback(
    (target: number) => {
      const next = clamp(target)
      setDirection(next >= index ? 1 : -1)
      setIndex(next)
    },
    [clamp, index],
  )

  const serviceIndexes = useMemo(() => (data ? data.services.map((s) => data.deck.ranges[s.id]?.first ?? 0) : []), [data])
  const currentServiceId = data ? serviceAt(data.deck, index) : null
  const timerService = data?.services.find((s) => s.id === (activeServiceId ?? currentServiceId)) ?? data?.services[0]
  const timerServicePos = data && timerService ? data.services.findIndex((s) => s.id === timerService.id) : -1

  const nextService = useCallback(() => {
    if (!data) return
    const nextPos = timerServicePos + 1
    const next = data.services[nextPos]
    if (next) {
      setActive(next.id)
      go(data.deck.ranges[next.id]?.first ?? index)
    } else {
      go(total - 1)
    }
  }, [data, timerServicePos, setActive, go, index, total])

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void document.documentElement.requestFullscreen?.().catch(() => toast.error('Le plein écran n’est pas disponible dans ce navigateur.'))
  }, [])

  const exit = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen()
    navigate(meetingId ? `/reunions/${meetingId}` : '/')
  }, [navigate, meetingId])

  // Raccourcis clavier
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.metaKey || e.ctrlKey || e.altKey) return
      if (ending) return
      const key = e.key
      if (overview || help) {
        if (key === 'Escape' || key === 'g' || key === 'G' || key === '?') {
          e.preventDefault()
          setOverview(false)
          setHelp(false)
        }
        return
      }
      switch (key) {
        case 'ArrowRight':
        case 'PageDown':
        case ' ':
        case 'Enter':
          e.preventDefault()
          go(index + 1)
          break
        case 'ArrowLeft':
        case 'PageUp':
        case 'Backspace':
          e.preventDefault()
          go(index - 1)
          break
        case 'Home':
          go(0)
          break
        case 'End':
          go(total - 1)
          break
        case 'f':
        case 'F':
          toggleFullscreen()
          break
        case 't':
        case 'T':
        case 'p':
        case 'P':
          toggleTimer()
          break
        case 'r':
        case 'R':
          resetService()
          break
        case 'n':
        case 'N':
          nextService()
          break
        case 'g':
        case 'G':
          setOverview(true)
          break
        case 'b':
        case 'B':
          setBarVisible((v) => !v)
          break
        case '?':
        case 'h':
        case 'H':
          setHelp(true)
          break
        case 'Escape':
          if (!document.fullscreenElement) exit()
          break
        default:
          if (/^[1-9]$/.test(key) && serviceIndexes[Number(key) - 1] !== undefined) go(serviceIndexes[Number(key) - 1])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, index, total, toggleFullscreen, toggleTimer, resetService, nextService, exit, overview, help, ending, serviceIndexes])

  const known = useAppStore.getState().snapshot?.meetings.some((m) => m.id === meetingId)
  if (!known) {
    return (
      <div className="grid min-h-screen place-items-center bg-novia-950 p-6 text-center text-white">
        <div>
          <p className="font-display text-2xl font-bold">Réunion introuvable</p>
          <p className="mt-2 text-white/80">Cette présentation n’existe pas (ou plus) dans vos données.</p>
          <button onClick={() => navigate('/')} className="mt-6 rounded-lg bg-white px-4 py-2 font-semibold text-novia-800 hover:bg-novia-50">
            Revenir au tableau de bord
          </button>
        </div>
      </div>
    )
  }
  if (!bundle || !data) return <Splash />

  const planned = plannedMinutes(data.meeting)
  const atEnd = index === total - 1
  const timerMinutes = timerService ? data.meeting.durations[timerService.id] ?? timerService.durationMinutes : 0

  const endMeeting = async () => {
    const { serviceMs, globalMs } = useTimerStore.getState()
    useTimerStore.getState().pause()
    await updateMeeting(data.meeting.id, {
      status: 'held',
      timing: {
        totalSeconds: Math.round(globalMs / 1000),
        perService: Object.fromEntries(data.services.map((s) => [s.id, Math.round((serviceMs[s.id] ?? 0) / 1000)])),
        endedAt: new Date().toISOString(),
      },
    })
    toast.success('Réunion terminée : la présentation et les temps sont archivés.')
    setEnding(false)
    exit()
  }

  return (
    <div
      className="fixed inset-0 flex flex-col overflow-hidden bg-novia-950 text-white select-none"
      onTouchStart={(e) => (touchX.current = e.touches[0]?.clientX ?? null)}
      onTouchEnd={(e) => {
        if (touchX.current === null) return
        const dx = (e.changedTouches[0]?.clientX ?? 0) - touchX.current
        if (Math.abs(dx) > 60) go(index + (dx < 0 ? 1 : -1))
        touchX.current = null
      }}
    >
      <TopTimeBar data={data} serviceId={timerService?.id ?? null} />
      <h1 className="sr-only">{meetingTitle(data.meeting)}</h1>

      <div className="relative min-h-0 flex-1">
        <Stage data={data} index={index} direction={direction} />
        {!barVisible && timerService && (
          <div className="absolute right-4 bottom-4 z-20 rounded-2xl bg-novia-950/85 p-1.5 shadow-[var(--shadow-float)] backdrop-blur">
            <TimerCluster service={timerService} minutes={timerMinutes} warningSeconds={data.settings.warningSeconds} plannedTotalMinutes={planned} onNextService={nextService} hasNextService={timerServicePos < data.services.length - 1} />
          </div>
        )}
        {atEnd && isAdmin(user) && data.meeting.status !== 'held' && data.meeting.status !== 'archived' && (
          <button onClick={() => setEnding(true)} className="absolute top-6 left-1/2 z-20 inline-flex -translate-x-1/2 items-center gap-2 rounded-full bg-white px-5 py-2.5 font-semibold text-novia-800 shadow-[var(--shadow-float)] hover:bg-novia-50">
            <Flag size={18} /> Terminer la réunion
          </button>
        )}
      </div>

      {barVisible && (
        <div className="relative z-20 flex h-[68px] shrink-0 items-center gap-3 border-t border-white/10 bg-novia-950 px-3 sm:gap-4 sm:px-4">
          <div className="flex items-center gap-1">
            <button onClick={() => go(index - 1)} disabled={index === 0} className="grid size-10 place-items-center rounded-lg hover:bg-white/10 disabled:opacity-30" aria-label="Diapositive précédente" title="Précédente (←)">
              <ArrowLeft size={20} />
            </button>
            <button onClick={() => go(index + 1)} disabled={atEnd} className="grid size-10 place-items-center rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30" aria-label="Diapositive suivante" title="Suivante (→)">
              <ArrowRight size={20} />
            </button>
            <span className="ml-2 w-[64px] text-sm font-semibold text-white/80 tnum max-sm:mr-auto">
              {index + 1} / {total}
            </span>
          </div>
          <ProgressRibbon data={data} index={index} onJump={go} />
          {timerService && (
            <TimerCluster service={timerService} minutes={timerMinutes} warningSeconds={data.settings.warningSeconds} plannedTotalMinutes={planned} onNextService={nextService} hasNextService={timerServicePos < data.services.length - 1} />
          )}
          <div className="flex items-center gap-0.5 border-l border-white/10 pl-2">
            <button onClick={() => setOverview(true)} className="hidden size-10 place-items-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white sm:grid" aria-label="Vue d’ensemble" title="Vue d’ensemble (G)">
              <Grid2x2 size={19} />
            </button>
            <button onClick={() => setHelp(true)} className="hidden size-10 place-items-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white md:grid" aria-label="Raccourcis clavier" title="Raccourcis (?)">
              <Keyboard size={19} />
            </button>
            <button onClick={() => setBarVisible(false)} className="hidden size-10 place-items-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white md:grid" aria-label="Masquer la barre" title="Masquer la barre (B)">
              <PanelBottomClose size={19} />
            </button>
            <button onClick={toggleFullscreen} className="hidden size-10 place-items-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white sm:grid" aria-label={fullscreen ? 'Quitter le plein écran' : 'Plein écran'} title="Plein écran (F)">
              {fullscreen ? <Minimize size={19} /> : <Maximize size={19} />}
            </button>
            <button onClick={exit} className="grid size-10 place-items-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white" aria-label="Quitter la présentation" title="Quitter (Échap)">
              <X size={20} />
            </button>
          </div>
        </div>
      )}
      {!barVisible && (
        <button onClick={() => setBarVisible(true)} className="absolute bottom-4 left-4 z-20 grid size-10 place-items-center rounded-lg bg-novia-950/70 text-white/80 backdrop-blur hover:text-white" aria-label="Afficher la barre de contrôle" title="Afficher la barre (B)">
          <PanelBottomOpen size={19} />
        </button>
      )}

      {/* Vue d'ensemble */}
      {overview && (
        <div className="absolute inset-0 z-40 animate-fade-in overflow-y-auto bg-novia-950/97 p-6 backdrop-blur sm:p-10" role="dialog" aria-label="Vue d’ensemble des diapositives">
          <div className="mx-auto max-w-[1500px]">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="font-display text-xl font-bold text-white">{meetingTitle(data.meeting)}</h2>
              <button onClick={() => setOverview(false)} className="rounded-lg p-2 text-white/80 hover:bg-white/10" aria-label="Fermer">
                <X size={22} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-5">
              {data.deck.entries.map((entry, i) => (
                <button
                  key={entry.key}
                  onClick={() => {
                    go(i)
                    setOverview(false)
                  }}
                  className="text-left"
                >
                  <SlideThumb data={data} index={i} active={i === index} className="ring-white/10" />
                  <span className={clsx('mt-1.5 block text-xs font-semibold', i === index ? 'text-white' : 'text-white/60')}>{i + 1}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Aide */}
      {help && (
        <div className="absolute inset-0 z-40 grid animate-fade-in place-items-center bg-novia-950/80 p-6 backdrop-blur" onClick={() => setHelp(false)} role="dialog" aria-label="Raccourcis clavier">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 text-ink shadow-[var(--shadow-float)]" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-bold">Raccourcis clavier</h2>
            <dl className="divide-y divide-line">
              {SHORTCUTS.map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-6 py-2 text-sm">
                  <dt className="flex flex-wrap gap-1">
                    {k.split('  ').map((key) => (
                      <kbd key={key} className="rounded-md bg-canvas px-1.5 py-0.5 text-[13px] font-semibold text-novia-800 ring-1 ring-line">
                        {key}
                      </kbd>
                    ))}
                  </dt>
                  <dd className="text-right text-ink-2">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 rounded-xl bg-novia-950 p-2">
              <TimerResetAll />
            </div>
          </div>
        </div>
      )}

      {/* Fin de réunion */}
      {ending && <EndMeetingDialog data={data} onCancel={() => setEnding(false)} onConfirm={endMeeting} />}
    </div>
  )
}

function EndMeetingDialog({ data, onCancel, onConfirm }: { data: DeckRenderData; onCancel: () => void; onConfirm: () => void }) {
  const serviceMs = useTimerStore((s) => s.serviceMs)
  const globalMs = useTimerStore((s) => s.globalMs)
  const planned = plannedMinutes(data.meeting)
  return (
    <div className="absolute inset-0 z-50 grid animate-fade-in place-items-center bg-novia-950/80 p-6 backdrop-blur" role="dialog" aria-label="Terminer la réunion">
      <div className="w-full max-w-xl rounded-2xl bg-white p-6 text-ink shadow-[var(--shadow-float)]">
        <h2 className="text-lg font-bold">Terminer la réunion</h2>
        <p className="mt-1 text-sm text-ink-2">Les temps de parole sont enregistrés avec la présentation archivée.</p>
        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="text-left text-ink-3">
              <th className="py-1.5 font-semibold">Service</th>
              <th className="py-1.5 text-right font-semibold">Prévu</th>
              <th className="py-1.5 text-right font-semibold">Réel</th>
              <th className="py-1.5 text-right font-semibold">Écart</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data.services.map((s) => {
              const budget = (data.meeting.durations[s.id] ?? s.durationMinutes) * 60_000
              const used = serviceMs[s.id] ?? 0
              const diff = used - budget
              return (
                <tr key={s.id}>
                  <td className="py-2">
                    <span className="inline-flex items-center gap-2 font-semibold">
                      <span className="size-2.5 rounded-sm" style={{ background: s.palette.accent }} />
                      {s.shortName}
                    </span>
                  </td>
                  <td className="py-2 text-right tnum">{formatClock(budget)}</td>
                  <td className="py-2 text-right tnum">{formatClock(used)}</td>
                  <td className={clsx('py-2 text-right font-semibold tnum', diff > 0 ? 'text-red-700' : 'text-emerald-700')}>
                    {diff > 0 ? '+' : '−'}
                    {formatClock(Math.abs(diff))}
                  </td>
                </tr>
              )
            })}
            <tr className="font-bold">
              <td className="py-2">Total</td>
              <td className="py-2 text-right tnum">{planned}:00</td>
              <td className="py-2 text-right tnum">{formatClock(globalMs)}</td>
              <td className={clsx('py-2 text-right tnum', globalMs > planned * 60_000 ? 'text-red-700' : 'text-emerald-700')}>
                {globalMs > planned * 60_000 ? '+' : '−'}
                {formatClock(Math.abs(globalMs - planned * 60_000))}
              </td>
            </tr>
          </tbody>
        </table>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onCancel} className="h-10 rounded-lg px-4 font-semibold text-ink-2 hover:bg-canvas">
            Continuer la réunion
          </button>
          <button onClick={onConfirm} className="inline-flex h-10 items-center gap-2 rounded-lg bg-novia-600 px-4 font-semibold text-white hover:bg-novia-700">
            <Flag size={16} /> Terminer et archiver
          </button>
        </div>
      </div>
    </div>
  )
}
