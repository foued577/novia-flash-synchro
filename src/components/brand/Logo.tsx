import { clsx } from 'clsx'
import logoColor from '@/assets/brand/novia-logo.png'
import logoLight from '@/assets/brand/novia-logo-light.png'

export const LOGO_COLOR_URL = logoColor
export const LOGO_LIGHT_URL = logoLight

/** Logo NOVIA (fichiers extraits de la présentation officielle). */
export function NoviaLogo({ variant = 'color', className, height = 28 }: { variant?: 'color' | 'light'; className?: string; height?: number }) {
  return <img src={variant === 'color' ? logoColor : logoLight} alt="NOVIA" height={height} style={{ height }} className={clsx('w-auto select-none', className)} draggable={false} />
}

/** Signature de l'application : logo + nom du produit. */
export function AppMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <NoviaLogo height={compact ? 22 : 26} />
      {!compact && (
        <div className="border-l border-line pl-3 leading-none">
          <div className="font-display text-[15px] font-extrabold tracking-tight text-novia-700">Flash Synchro</div>
          <div className="mt-1 text-[11px] font-semibold text-ink-3">Pilotage hebdomadaire</div>
        </div>
      )}
    </div>
  )
}
