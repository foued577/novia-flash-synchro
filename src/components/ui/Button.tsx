import { clsx } from 'clsx'
import { Loader2, type LucideIcon } from 'lucide-react'
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle' | 'inverse'
type Size = 'xs' | 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: LucideIcon
  iconRight?: LucideIcon
  loading?: boolean
  children?: ReactNode
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-novia-600 text-white hover:bg-novia-700 active:bg-novia-800 shadow-[0_1px_0_rgb(255_255_255/0.15)_inset,0_1px_2px_rgb(15_28_58/0.2)]',
  secondary: 'bg-white text-ink border border-line-strong hover:bg-canvas hover:border-ink-3/40',
  ghost: 'text-ink-2 hover:bg-canvas hover:text-ink',
  danger: 'bg-white text-red-700 border border-red-200 hover:bg-red-50',
  subtle: 'bg-novia-50 text-novia-700 hover:bg-novia-100',
  inverse: 'bg-white/10 text-white hover:bg-white/20 border border-white/15',
}

const SIZES: Record<Size, string> = {
  xs: 'h-7 px-2 text-[13px] gap-1 rounded-md',
  sm: 'h-8 px-3 text-sm gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-[15px] gap-2 rounded-lg',
  lg: 'h-12 px-5 text-base gap-2 rounded-xl',
}

const ICON: Record<Size, number> = { xs: 14, sm: 16, md: 18, lg: 20 }

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon: Icon, iconRight: IconRight, loading, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center font-semibold whitespace-nowrap transition-colors select-none disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 size={ICON[size]} className="animate-spin" /> : Icon ? <Icon size={ICON[size]} strokeWidth={2} aria-hidden /> : null}
      {children}
      {IconRight && <IconRight size={ICON[size]} strokeWidth={2} aria-hidden />}
    </button>
  )
})

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon
  label: string
  size?: Size
  variant?: Variant
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon: Icon, label, size = 'sm', variant = 'ghost', className, type = 'button', ...rest },
  ref,
) {
  const dims: Record<Size, string> = { xs: 'size-7 rounded-md', sm: 'size-8 rounded-lg', md: 'size-10 rounded-lg', lg: 'size-12 rounded-xl' }
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={clsx('inline-flex shrink-0 items-center justify-center transition-colors disabled:opacity-40', VARIANTS[variant], dims[size], className)}
      {...rest}
    >
      <Icon size={ICON[size]} strokeWidth={2} aria-hidden />
    </button>
  )
})
