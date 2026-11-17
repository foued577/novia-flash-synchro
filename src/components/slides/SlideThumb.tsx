import { clsx } from 'clsx'
import { memo } from 'react'
import type { DeckRenderData, RenderMode } from './context'
import { DeckEntryView } from './DeckSlides'
import { ScaledSlide } from './ScaledSlide'

/** Diapositive miniature (vignette ou aperçu en direct). */
export const SlideThumb = memo(function SlideThumb({ data, index, mode = 'thumb', className, active }: { data: DeckRenderData; index: number; mode?: RenderMode; className?: string; active?: boolean }) {
  return (
    <ScaledSlide
      mode={mode}
      className={clsx('rounded-xl bg-white shadow-[var(--shadow-panel)] ring-1', active ? 'ring-2 ring-novia-500' : 'ring-line', className)}
    >
      <DeckEntryView data={data} index={index} />
    </ScaledSlide>
  )
})
