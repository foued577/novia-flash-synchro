import { createRoot } from 'react-dom/client'
import { RenderModeContext, SLIDE_H, SLIDE_W, type DeckRenderData } from '@/components/slides/context'
import { DeckEntryView } from '@/components/slides/DeckSlides'
import { slugify } from '@/lib/files'
import { saveFile, type SaveOutcome } from '@/lib/platform'

// ---------------------------------------------------------------------------
// Export PDF : chaque diapositive est rendue hors écran en 1920×1080 puis
// capturée (html-to-image), une page par diapositive au format 16:9
// (même format que la présentation PowerPoint historique : 1440 × 810 pt).
// ---------------------------------------------------------------------------

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))

async function waitForImages(root: HTMLElement) {
  const images = Array.from(root.querySelectorAll('img'))
  await Promise.all(
    images.map((img) =>
      img.complete && img.naturalWidth > 0
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true })
            img.addEventListener('error', () => resolve(), { once: true })
          }),
    ),
  )
}

/** Monte toutes les diapositives hors écran et renvoie leurs nœuds DOM. */
export async function mountDeckOffscreen(data: DeckRenderData) {
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText = `position:fixed;left:-${SLIDE_W + 200}px;top:0;width:${SLIDE_W}px;pointer-events:none;`
  document.body.appendChild(host)
  const root = createRoot(host)
  root.render(
    <RenderModeContext.Provider value="export">
      {data.deck.entries.map((entry, i) => (
        <div key={entry.key} data-export-slide style={{ width: SLIDE_W, height: SLIDE_H, overflow: 'hidden', position: 'relative', background: '#fff' }}>
          <DeckEntryView data={data} index={i} />
        </div>
      ))}
    </RenderModeContext.Provider>,
  )
  await wait(80)
  await document.fonts.ready
  await waitForImages(host)
  await frames()
  await wait(350)
  const nodes = Array.from(host.querySelectorAll<HTMLElement>('[data-export-slide]'))
  return {
    nodes,
    dispose: () => {
      root.unmount()
      host.remove()
    },
  }
}

export function deckFileName(data: DeckRenderData, ext: string) {
  return `${slugify(`flash-synchro-${data.meeting.isoYear}-s${String(data.meeting.isoWeek).padStart(2, '0')}`)}.${ext}`
}

export async function exportDeckToPdf(data: DeckRenderData, onProgress?: (done: number, total: number) => void): Promise<SaveOutcome> {
  const [{ jsPDF }, htmlToImage] = await Promise.all([import('jspdf'), import('html-to-image')])
  const { nodes, dispose } = await mountDeckOffscreen(data)
  try {
    const fontEmbedCSS = await htmlToImage.getFontEmbedCSS(nodes[0])
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [1440, 810], compress: true })
    pdf.setProperties({ title: `Flash Synchro – Semaine ${data.meeting.isoWeek}`, author: data.settings.orgName, creator: 'NOVIA Flash Synchro' })
    for (let i = 0; i < nodes.length; i++) {
      const url = await htmlToImage.toJpeg(nodes[i], { quality: 0.9, pixelRatio: 1.25, width: SLIDE_W, height: SLIDE_H, fontEmbedCSS, backgroundColor: '#ffffff' })
      if (i > 0) pdf.addPage([1440, 810], 'landscape')
      pdf.addImage(url, 'JPEG', 0, 0, 1440, 810, undefined, 'FAST')
      onProgress?.(i + 1, nodes.length)
    }
    return await saveFile(pdf.output('blob'), deckFileName(data, 'pdf'))
  } finally {
    dispose()
  }
}
