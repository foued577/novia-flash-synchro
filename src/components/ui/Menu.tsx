import { clsx } from 'clsx'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

export interface MenuItem {
  label: string
  icon?: LucideIcon
  onSelect: () => void
  danger?: boolean
  disabled?: boolean
  hint?: string
}

interface MenuProps {
  trigger: (props: { onClick: () => void; 'aria-expanded': boolean; 'aria-haspopup': 'menu' }) => ReactNode
  items: (MenuItem | 'separator')[]
  align?: 'left' | 'right'
  placement?: 'bottom' | 'top'
  className?: string
}

export function Menu({ trigger, items, align = 'right', placement = 'bottom', className }: MenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  return (
    <div ref={ref} className={clsx('relative inline-block', className)}>
      {trigger({ onClick: () => setOpen((o) => !o), 'aria-expanded': open, 'aria-haspopup': 'menu' })}
      {open && (
        <div
          role="menu"
          className={clsx(
            'absolute z-40 min-w-56 animate-pop-in rounded-xl border border-line bg-white p-1.5 shadow-[var(--shadow-float)]',
            align === 'right' ? 'right-0' : 'left-0',
            placement === 'bottom' ? 'top-full mt-1.5' : 'bottom-full mb-1.5',
          )}
        >
          {items.map((item, i) =>
            item === 'separator' ? (
              <div key={`sep-${i}`} className="my-1 h-px bg-line" />
            ) : (
              <button
                key={item.label}
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false)
                  item.onSelect()
                }}
                className={clsx(
                  'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors disabled:opacity-40',
                  item.danger ? 'text-red-700 hover:bg-red-50' : 'text-ink hover:bg-canvas',
                )}
              >
                {item.icon && <item.icon size={16} className={item.danger ? 'text-red-600' : 'text-ink-3'} aria-hidden />}
                <span className="flex-1">{item.label}</span>
                {item.hint && <span className="text-xs text-ink-3">{item.hint}</span>}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  )
}
