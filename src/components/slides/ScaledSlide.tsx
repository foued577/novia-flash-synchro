import { clsx } from 'clsx'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { RenderModeContext, SLIDE_H, SLIDE_W, type RenderMode } from './context'

/**
 * Affiche une diapositive 1920×1080 à l'échelle de son conteneur.
 *  - fit="width"   : occupe toute la largeur (aperçus, vignettes)
 *  - fit="contain" : s'inscrit dans le conteneur (mode présentation)
 */
export function ScaledSlide({ children, fit = 'width', mode = 'preview', className, rounded = true }: { children: ReactNode; fit?: 'width' | 'contain'; mode?: RenderMode; className?: string; rounded?: boolean }) {
  const outer = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  useLayoutEffect(() => {
    const el = outer.current
    if (!el) return
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const scale = fit === 'width' ? size.w / SLIDE_W : Math.min(size.w / SLIDE_W, size.h / SLIDE_H)
  const offsetX = fit === 'contain' ? (size.w - SLIDE_W * scale) / 2 : 0
  const offsetY = fit === 'contain' ? (size.h - SLIDE_H * scale) / 2 : 0

  return (
    <div
      ref={outer}
      className={clsx('relative overflow-hidden', fit === 'width' && 'aspect-video w-full', fit === 'contain' && 'h-full w-full', className)}
    >
      {size.w > 0 && (
        <div
          className={clsx('absolute top-0 left-0 origin-top-left overflow-hidden bg-white', rounded && fit === 'width' && 'rounded-[inherit]')}
          style={{ width: SLIDE_W, height: SLIDE_H, transform: `translate(${offsetX}px, ${offsetY}px) scale(${scale})` }}
        >
          <RenderModeContext.Provider value={mode}>{children}</RenderModeContext.Provider>
        </div>
      )}
    </div>
  )
}
