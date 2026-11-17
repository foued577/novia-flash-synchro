import { clsx } from 'clsx'
import { Briefcase, Building2, FolderOpen, GraduationCap, Megaphone, Sparkles, Users, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Service, ServiceIcon as ServiceIconKey } from '@/domain/types'
import { initials } from '@/lib/format'

export const SERVICE_ICONS: Record<ServiceIconKey, LucideIcon> = {
  graduation: GraduationCap,
  briefcase: Briefcase,
  folder: FolderOpen,
  users: Users,
  megaphone: Megaphone,
  building: Building2,
  sparkles: Sparkles,
}

export function ServiceIcon({ icon, size = 16, className }: { icon: ServiceIconKey; size?: number; className?: string }) {
  const Icon = SERVICE_ICONS[icon] ?? Sparkles
  return <Icon size={size} className={className} aria-hidden />
}

/** Pastille de service : la couleur est toujours accompagnée du nom. */
export function ServiceBadge({ service, size = 'md', showName = true }: { service: Service; size?: 'sm' | 'md' | 'lg'; showName?: boolean }) {
  const box = size === 'sm' ? 'size-6 rounded-md' : size === 'lg' ? 'size-11 rounded-xl' : 'size-8 rounded-lg'
  const icon = size === 'sm' ? 13 : size === 'lg' ? 22 : 16
  return (
    <span className="inline-flex min-w-0 items-center gap-2.5">
      <span className={clsx('grid shrink-0 place-items-center text-white', box)} style={{ background: service.palette.accent }}>
        <ServiceIcon icon={service.icon} size={icon} />
      </span>
      {showName && <span className="truncate font-semibold text-ink">{service.shortName}</span>}
    </span>
  )
}

export function Avatar({ name, color = '#3661B3', size = 32 }: { name: string; color?: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-grid shrink-0 place-items-center rounded-full font-display font-bold text-white"
      style={{ width: size, height: size, background: color, fontSize: Math.round(size * 0.38) }}
    >
      {initials(name)}
    </span>
  )
}

export function ProgressRing({ value, size = 120, stroke = 12, color = '#3661B3', track = '#E2E7EF', children }: { value: number; size?: number; stroke?: number; color?: string; track?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(1, value))
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - clamped)}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  )
}

export function EmptyState({ icon: Icon, title, children, action }: { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <span className="mb-4 grid size-12 place-items-center rounded-2xl bg-novia-50 text-novia-600">
        <Icon size={22} />
      </span>
      <h3 className="text-base font-bold">{title}</h3>
      {children && <div className="mt-1 max-w-md text-sm text-ink-2">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-sm font-semibold text-ink-3">{eyebrow}</div>}
        <h1 className="text-2xl font-bold sm:text-[28px]">{title}</h1>
        {description && <div className="mt-1 text-ink-2">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-[17px] font-bold">{children}</h2>
      {action}
    </div>
  )
}
