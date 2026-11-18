import { Download, FileText, Presentation } from 'lucide-react'
import { toast } from 'sonner'
import { buildDeckRenderData } from '@/components/slides/useDeckData'
import { useAppStore } from '@/store/useAppStore'
import { Button } from '../ui/Button'
import { Menu } from '../ui/Menu'

export async function runExport(meetingId: string, kind: 'pdf' | 'pptx') {
  const { loadBundle } = useAppStore.getState()
  const bundle = await loadBundle(meetingId)
  const data = buildDeckRenderData(useAppStore.getState().snapshot, bundle)
  if (!data) return
  const label = kind === 'pdf' ? 'PDF' : 'PowerPoint'
  const id = toast.loading(`Préparation de l’export ${label}…`)
  try {
    const progress = (done: number, total: number) => toast.loading(`Export ${label} : diapositive ${done} sur ${total}`, { id })
    const outcome =
      kind === 'pdf'
        ? await (await import('@/lib/export/exportPdf')).exportDeckToPdf(data, progress)
        : await (await import('@/lib/export/exportPptx')).exportDeckToPptx(data, progress)
    if (outcome === 'declined') toast.info('Téléchargement annulé', { id })
    else toast.success(`Export ${label} téléchargé`, { id })
  } catch (error) {
    console.error(error)
    toast.error(`L’export ${label} a échoué : ${error instanceof Error ? error.message : 'erreur inconnue'}`, { id })
  }
}

export function ExportMenu({ meetingId, size = 'md', variant = 'secondary', align = 'right' }: { meetingId: string; size?: 'sm' | 'md' | 'lg'; variant?: 'secondary' | 'ghost' | 'inverse'; align?: 'left' | 'right' }) {
  return (
    <Menu
      align={align}
      items={[
        { label: 'PDF (une page par diapositive)', icon: FileText, onSelect: () => void runExport(meetingId, 'pdf') },
        { label: 'PowerPoint modifiable (.pptx)', icon: Presentation, onSelect: () => void runExport(meetingId, 'pptx') },
      ]}
      trigger={(props) => (
        <Button {...props} variant={variant} size={size} icon={Download}>
          Exporter
        </Button>
      )}
    />
  )
}
