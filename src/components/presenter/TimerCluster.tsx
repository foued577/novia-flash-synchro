import { clsx } from 'clsx'
import { AlarmClockOff, Pause, Play, RotateCcw, SkipForward } from 'lucide-react'
import type { Service } from '@/domain/types'
import { formatClock } from '@/lib/format'
import { useTimerStore } from '@/store/useTimerStore'

export type TimerPhase = 'idle' | 'running' | 'paused' | 'warning' | 'overtime'

export function useServiceTimer(service: Service | undefined, minutes: number, warningSeconds: number) {
  const elapsed = useTimerStore((s) => (service ? s.serviceMs[service.id] ?? 0 : 0))
  const running = useTimerStore((s) => s.running)
  const startedAt = useTimerStore((s) => s.startedAt)
  const budget = minutes * 60_000
  const remaining = budget - elapsed
  const phase: TimerPhase = remaining < 0 ? 'overtime' : remaining <= warningSeconds * 1000 && elapsed > 0 ? 'warning' : !startedAt ? 'idle' : running ? 'running' : 'paused'
  return { elapsed, remaining, budget, phase, running, ratio: budget > 0 ? Math.min(1, elapsed / budget) : 0 }
}

interface Props {
  service: Service | undefined
  minutes: number
  warningSeconds: number
  plannedTotalMinutes: number
  onNextService: () => void
  hasNextService: boolean
}

/** Chronomètre de séance : compte à rebours du service en cours + temps global. */
export function TimerCluster({ service, minutes, warningSeconds, plannedTotalMinutes, onNextService, hasNextService }: Props) {
  const { remaining, phase, running, ratio } = useServiceTimer(service, minutes, warningSeconds)
  const globalMs = useTimerStore((s) => s.globalMs)
  const toggle = useTimerStore((s) => s.toggle)
  const resetService = useTimerStore((s) => s.resetService)
  const globalOver = globalMs > plannedTotalMinutes * 60_000

  const tone = {
    idle: 'bg-white/8 text-white',
    running: 'bg-white/8 text-white',
    paused: 'bg-white/8 text-white',
    warning: 'bg-amber-400 text-novia-950',
    overtime: 'bg-red-600 text-white animate-pulse-soft',
  }[phase]

  return (
    <div className="flex items-center gap-2">
      <div className={clsx('flex items-center gap-3 rounded-xl py-1.5 pr-1.5 pl-3 transition-colors duration-500', tone)} role="timer" aria-live="off">
        {service ? (
          <span className="flex min-w-0 items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-sm" style={{ background: phase === 'warning' || phase === 'overtime' ? 'currentColor' : service.palette.accent }} aria-hidden />
            <span className="hidden max-w-[150px] truncate text-sm font-semibold xl:inline">{service.shortName}</span>
          </span>
        ) : (
          <span className="text-sm font-semibold opacity-80">Hors service</span>
        )}
        <span className="flex flex-col items-end leading-none">
          <span className="font-display text-[26px] font-bold tnum">{phase === 'overtime' ? formatClock(remaining, { signed: true }) : formatClock(remaining)}</span>
          <span className={clsx('mt-0.5 text-[11px] font-semibold', phase === 'warning' ? 'text-novia-950/75' : 'text-white/70')}>
            {phase === 'overtime' ? 'Temps dépassé' : phase === 'warning' ? 'Bientôt terminé' : `sur ${minutes} min`}
          </span>
        </span>
        <span className="relative hidden h-9 w-1.5 overflow-hidden rounded-full bg-white/20 sm:block" aria-hidden>
          <span className="absolute inset-x-0 bottom-0 rounded-full bg-current" style={{ height: `${ratio * 100}%`, transition: 'height 0.3s linear' }} />
        </span>
        <button
          onClick={toggle}
          className={clsx('grid size-10 place-items-center rounded-lg transition-colors', phase === 'warning' ? 'hover:bg-black/10' : 'hover:bg-white/15', phase === 'idle' && 'bg-white text-novia-900 hover:bg-white/90')}
          aria-label={running ? 'Mettre en pause le chronomètre' : 'Démarrer le chronomètre'}
          title={running ? 'Pause (T)' : 'Démarrer (T)'}
        >
          {running ? <Pause size={20} /> : <Play size={20} />}
        </button>
      </div>
      <button onClick={() => resetService()} className="hidden size-10 place-items-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white sm:grid" aria-label="Réinitialiser le temps du service" title="Réinitialiser le service (R)">
        <RotateCcw size={18} />
      </button>
      <button
        onClick={onNextService}
        disabled={!hasNextService}
        className="hidden h-10 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold text-white/85 hover:bg-white/10 hover:text-white disabled:opacity-30 md:inline-flex"
        title="Service suivant (N)"
      >
        <SkipForward size={18} /> <span className="hidden 2xl:inline">Service suivant</span>
      </button>
      <div className="ml-1 hidden flex-col items-end leading-tight lg:flex" title="Durée de la réunion">
        <span className={clsx('font-display text-[17px] font-bold tnum', globalOver ? 'text-amber-300' : 'text-white')}>{formatClock(globalMs)}</span>
        <span className="text-[11px] font-semibold text-white/65">réunion / {plannedTotalMinutes} min</span>
      </div>
    </div>
  )
}

export function TimerResetAll() {
  const resetAll = useTimerStore((s) => s.resetAll)
  return (
    <button onClick={resetAll} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-white/80 hover:bg-white/10 hover:text-white">
      <AlarmClockOff size={16} /> Réinitialiser tous les chronomètres
    </button>
  )
}
