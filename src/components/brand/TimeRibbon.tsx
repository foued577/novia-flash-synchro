import { clsx } from 'clsx'
import { CheckCircle2, CircleDashed, PencilLine, Send } from 'lucide-react'
import { SUBMISSION_STATUS } from '@/domain/status'
import type { Service, SubmissionStatus } from '@/domain/types'
import { addMinutesToTime } from '@/lib/format'

// ---------------------------------------------------------------------------
// Le « ruban du temps » : les 25 minutes de la réunion découpées par service,
// proportionnellement au temps alloué. Motif central de l'application
// (tableau de bord, ordre du jour, suivi en séance).
// ---------------------------------------------------------------------------

const STATUS_ICON = { draft: CircleDashed, in_progress: PencilLine, submitted: Send, validated: CheckCircle2 }

interface TimeRibbonProps {
  services: Service[]
  durations: Record<string, number>
  startTime?: string
  statuses?: Record<string, SubmissionStatus>
  activeServiceId?: string | null
  /** Temps réellement consommé par service (ms), affiché en surimpression. */
  elapsedMs?: Record<string, number>
  onSelect?: (serviceId: string) => void
  dark?: boolean
  showTicks?: boolean
  height?: number
}

export function TimeRibbon({ services, durations, startTime, statuses, activeServiceId, elapsedMs, onSelect, dark, showTicks = true, height = 28 }: TimeRibbonProps) {
  const total = services.reduce((sum, s) => sum + (durations[s.id] ?? 0), 0) || 1
  let cursor = 0

  return (
    <div className="w-full">
      <div className="flex w-full gap-[3px]" style={{ height }} role="list" aria-label="Répartition du temps par service">
        {services.map((service) => {
          const minutes = durations[service.id] ?? 0
          const share = minutes / total
          const status = statuses?.[service.id]
          const Icon = status ? STATUS_ICON[status] : null
          const used = elapsedMs ? Math.min(1, (elapsedMs[service.id] ?? 0) / Math.max(1, minutes * 60_000)) : 0
          const over = elapsedMs ? (elapsedMs[service.id] ?? 0) > minutes * 60_000 : false
          const isActive = activeServiceId === service.id
          const className = clsx(
            'relative flex min-w-0 items-center gap-1.5 overflow-hidden rounded-[4px] px-2 text-left text-white transition-[opacity,box-shadow]',
            activeServiceId && !isActive && 'opacity-45',
            isActive && (dark ? 'ring-2 ring-white ring-offset-2 ring-offset-novia-950' : 'ring-2 ring-novia-900/70 ring-offset-1'),
            onSelect && 'cursor-pointer hover:opacity-100',
          )
          const style = { flexGrow: share, flexBasis: 0, background: elapsedMs ? `${service.palette.accent}66` : service.palette.accent }
          const title = `${service.name} — ${minutes} min${status ? ` — ${SUBMISSION_STATUS[status].label}` : ''}`
          const content = (
            <>
              {elapsedMs && (
                <span
                  aria-hidden
                  className={clsx('absolute inset-y-0 left-0', over && 'animate-pulse-soft')}
                  style={{ width: `${used * 100}%`, background: over ? '#D03B3B' : service.palette.accent }}
                />
              )}
              <span className="relative flex min-w-0 flex-1 items-baseline gap-1.5">
                <span className="truncate text-[13px] font-semibold">{service.shortName}</span>
                <span className="shrink-0 text-xs font-medium opacity-85">{minutes} min</span>
              </span>
              {Icon && status && <Icon size={14} className="relative shrink-0 opacity-90" aria-label={SUBMISSION_STATUS[status].label} />}
            </>
          )
          return onSelect ? (
            <button key={service.id} type="button" role="listitem" onClick={() => onSelect(service.id)} title={title} className={className} style={style}>
              {content}
            </button>
          ) : (
            <div key={service.id} role="listitem" title={title} className={className} style={style}>
              {content}
            </div>
          )
        })}
      </div>
      {showTicks && startTime && (
        <div className="relative mt-1.5 hidden h-4 text-[11px] font-semibold text-ink-3 tnum sm:block">
          {[...services, null].map((service, i) => {
            const left = (cursor / total) * 100
            const label = addMinutesToTime(startTime, cursor)
            if (service) cursor += durations[service.id] ?? 0
            return (
              <span
                key={service?.id ?? 'end'}
                className={clsx('absolute', dark && 'text-white/60')}
                style={i === services.length ? { right: 0 } : { left: `${left}%`, transform: i === 0 ? 'none' : 'translateX(-50%)' }}
              >
                {label.replace(':', ' h ')}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}
