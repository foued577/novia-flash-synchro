import { clsx } from 'clsx'
import type { ReactNode } from 'react'
import { Archive, CalendarCheck2, CheckCircle2, CircleDashed, Clock3, PencilLine, Send, Sparkles } from 'lucide-react'
import { MEETING_STATUS, SUBMISSION_STATUS } from '@/domain/status'
import type { MeetingStatus, SubmissionStatus } from '@/domain/types'

const SUBMISSION_ICONS = { draft: CircleDashed, in_progress: PencilLine, submitted: Send, validated: CheckCircle2 }
const MEETING_ICONS = { preparation: Clock3, ready: Sparkles, held: CalendarCheck2, archived: Archive }

export function StatusBadge({ status, size = 'md', className }: { status: SubmissionStatus; size?: 'sm' | 'md'; className?: string }) {
  const style = SUBMISSION_STATUS[status]
  const Icon = SUBMISSION_ICONS[status]
  return (
    <span
      title={style.description}
      className={clsx(
        'inline-flex items-center gap-1 rounded-full font-semibold whitespace-nowrap ring-1 ring-inset',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-[13px]',
        style.badge,
        className,
      )}
    >
      <Icon size={size === 'sm' ? 12 : 14} strokeWidth={2.2} aria-hidden />
      {style.label}
    </span>
  )
}

export function MeetingStatusBadge({ status, className }: { status: MeetingStatus; className?: string }) {
  const style = MEETING_STATUS[status]
  const Icon = MEETING_ICONS[status]
  return (
    <span title={style.description} className={clsx('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[13px] font-semibold whitespace-nowrap ring-1 ring-inset', style.badge, className)}>
      <Icon size={14} strokeWidth={2.2} aria-hidden />
      {style.label}
    </span>
  )
}

export function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={clsx('inline-flex items-center gap-1 rounded-full bg-canvas px-2.5 py-1 text-[13px] font-semibold text-ink-2 ring-1 ring-line ring-inset', className)}>{children}</span>
}
