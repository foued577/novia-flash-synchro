import { clsx } from 'clsx'
import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { create } from 'zustand'
import { Button } from './Button'

interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children?: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

const WIDTHS = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }

export function Dialog({ open, onClose, title, description, children, footer, size = 'md' }: DialogProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    const t = window.setTimeout(() => {
      const first = panelRef.current?.querySelector<HTMLElement>('input, select, textarea, [data-autofocus]')
      ;(first ?? panelRef.current)?.focus()
    }, 30)
    return () => {
      document.removeEventListener('keydown', onKey)
      window.clearTimeout(t)
      previous?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center sm:p-6">
      <div className="fixed inset-0 animate-fade-in bg-novia-950/45 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={clsx('relative w-full animate-pop-in rounded-2xl bg-white shadow-[var(--shadow-float)] outline-none', WIDTHS[size])}
      >
        <div className="flex items-start gap-4 border-b border-line px-6 py-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-lg font-bold">
              {title}
            </h2>
            {description && <p className="mt-0.5 text-sm text-ink-2">{description}</p>}
          </div>
          <button onClick={onClose} className="-mr-2 rounded-lg p-2 text-ink-3 hover:bg-canvas hover:text-ink" aria-label="Fermer">
            <X size={18} />
          </button>
        </div>
        {children && <div className="max-h-[70vh] overflow-y-auto px-6 py-5 scrollbar-thin">{children}</div>}
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 rounded-b-2xl border-t border-line bg-canvas/60 px-6 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

// ---------------------------------------------------------------------------
// Confirmation globale : const ok = await confirmAction({...})
// ---------------------------------------------------------------------------

interface ConfirmRequest {
  title: string
  message: string
  confirmLabel: string
  danger?: boolean
  resolve: (ok: boolean) => void
}

const useConfirmStore = create<{ request: ConfirmRequest | null }>(() => ({ request: null }))

export function confirmAction(opts: Omit<ConfirmRequest, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => useConfirmStore.setState({ request: { ...opts, resolve } }))
}

export function ConfirmHost() {
  const request = useConfirmStore((s) => s.request)
  const close = (ok: boolean) => {
    request?.resolve(ok)
    useConfirmStore.setState({ request: null })
  }
  return (
    <Dialog
      open={!!request}
      onClose={() => close(false)}
      title={request?.title ?? ''}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => close(false)}>
            Annuler
          </Button>
          <Button variant={request?.danger ? 'danger' : 'primary'} onClick={() => close(true)} data-autofocus>
            {request?.confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-ink-2">{request?.message}</p>
    </Dialog>
  )
}
