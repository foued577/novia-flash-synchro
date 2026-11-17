import { clsx } from 'clsx'
import { Minus, Plus } from 'lucide-react'
import { useId, type ReactNode, type SelectHTMLAttributes } from 'react'

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={clsx('block', className)}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-3">{hint}</span>}
    </label>
  )
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={clsx('field appearance-none bg-[length:16px] bg-[right_0.6rem_center] bg-no-repeat pr-8', className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2377839a' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }} {...rest}>
      {children}
    </select>
  )
}

export function Switch({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; disabled?: boolean }) {
  const id = useId()
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="block text-[15px] font-semibold text-ink">
          {label}
        </label>
        {description && <p className="text-sm text-ink-2">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx('relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50', checked ? 'bg-novia-600' : 'bg-line-strong')}
      >
        <span className={clsx('inline-block size-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-5.5' : 'translate-x-0.5')} />
      </button>
    </div>
  )
}

export function Stepper({ value, onChange, min = 0, max = 999, step = 1, suffix, disabled, label }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; suffix?: string; disabled?: boolean; label: string }) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v))
  return (
    <div className="inline-flex items-center rounded-lg border border-line-strong bg-white">
      <button type="button" aria-label={`Diminuer ${label}`} disabled={disabled || value <= min} onClick={() => onChange(clamp(value - step))} className="grid size-8 place-items-center text-ink-2 hover:text-ink disabled:opacity-30">
        <Minus size={14} />
      </button>
      <input
        aria-label={label}
        type="number"
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => onChange(clamp(Number(e.target.value) || min))}
        className="tnum w-10 border-x border-line bg-transparent py-1 text-center text-sm font-semibold focus:outline-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      {suffix && <span className="pl-1.5 text-xs text-ink-3">{suffix}</span>}
      <button type="button" aria-label={`Augmenter ${label}`} disabled={disabled || value >= max} onClick={() => onChange(clamp(value + step))} className="grid size-8 place-items-center text-ink-2 hover:text-ink disabled:opacity-30">
        <Plus size={14} />
      </button>
    </div>
  )
}

export function Segmented<T extends string>({ value, onChange, options, size = 'md' }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; size?: 'sm' | 'md' }) {
  return (
    <div className="inline-flex rounded-lg bg-canvas p-0.5 ring-1 ring-line ring-inset" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            'rounded-md font-semibold transition-colors',
            size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm',
            value === o.value ? 'bg-white text-ink shadow-sm ring-1 ring-line' : 'text-ink-2 hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
