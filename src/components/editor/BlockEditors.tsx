import { clsx } from 'clsx'
import { ArrowDown, ArrowUp, CheckCircle2, Circle, ClipboardPaste, Clock3, ImagePlus, Plus, Trash2, X } from 'lucide-react'
import { useRef, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode } from 'react'
import { toast } from 'sonner'
import { CHART_SWATCHES, kpiItem, parseTabular, seriesColor } from '@/domain/blocks'
import { SEVERITY } from '@/domain/status'
import type {
  Block,
  ChartBlock,
  ChartType,
  EventsBlock,
  ImageBlock,
  IssuesBlock,
  KpiBlock,
  KpiTrend,
  ListBlock,
  ListItemStatus,
  TableBlock,
  TextBlock,
} from '@/domain/types'
import { parseNumber } from '@/lib/format'
import { uid } from '@/lib/ids'
import { Button, IconButton } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { Segmented, Select } from '../ui/Form'

export interface EditorContext {
  accent: string
  /** Lundi de la semaine de prévision (date par défaut des événements). */
  defaultEventDate: string
  /** Tableaux présents sur la diapositive (pour générer un graphique). */
  tables: TableBlock[]
  uploadImage: (file: File) => Promise<string>
}

interface Props<T extends Block> {
  block: T
  onChange: (next: T) => void
  ctx: EditorContext
}

const cell = 'w-full min-w-0 rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm text-ink hover:border-line focus:border-novia-400 focus:bg-white focus:ring-2 focus:ring-novia-100 focus:outline-none'

function AddRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-novia-700 hover:bg-novia-50">
      <Plus size={16} /> {label}
    </button>
  )
}

function moveItem<T>(list: T[], index: number, dir: -1 | 1): T[] {
  const target = index + dir
  if (target < 0 || target >= list.length) return list
  const next = [...list]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

// ----- Indicateurs ---------------------------------------------------------------------

export function KpiEditor({ block, onChange }: Props<KpiBlock>) {
  const update = (index: number, patch: Partial<KpiBlock['items'][number]>) => onChange({ ...block, items: block.items.map((it, i) => (i === index ? { ...it, ...patch } : it)) })
  return (
    <div>
      <div className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1fr)_70px_minmax(0,1fr)_110px_64px] gap-2 px-1 pb-1 text-xs font-semibold text-ink-3 md:grid">
        <span>Libellé</span>
        <span>Valeur</span>
        <span>Rappel S-1</span>
        <span>Unité</span>
        <span>Objectif</span>
        <span>Évolution favorable</span>
        <span />
      </div>
      <div className="space-y-2 md:space-y-1">
        {block.items.map((item, i) => (
          <div key={item.id} className="grid grid-cols-2 gap-2 rounded-lg border border-line p-2 md:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1fr)_70px_minmax(0,1fr)_110px_64px] md:border-0 md:p-0">
            <input className={clsx(cell, 'col-span-2 font-semibold md:col-span-1')} value={item.label} placeholder="Ex. : Total contrats 26/27" onChange={(e) => update(i, { label: e.target.value })} aria-label="Libellé" />
            <input className={clsx(cell, 'font-semibold tnum')} value={item.value} placeholder="Valeur" onChange={(e) => update(i, { value: e.target.value })} aria-label="Valeur" />
            <input className={clsx(cell, 'tnum text-ink-2')} value={item.previous} placeholder="Rappel" onChange={(e) => update(i, { previous: e.target.value })} aria-label="Valeur de rappel" />
            <input className={cell} value={item.unit} placeholder="—" onChange={(e) => update(i, { unit: e.target.value })} aria-label="Unité" />
            <input className={clsx(cell, 'tnum')} value={item.target} placeholder="—" onChange={(e) => update(i, { target: e.target.value })} aria-label="Objectif" />
            <select className={clsx(cell, 'pr-1')} value={item.goodWhen} onChange={(e) => update(i, { goodWhen: e.target.value as KpiTrend })} aria-label="Évolution favorable">
              <option value="up">À la hausse</option>
              <option value="down">À la baisse</option>
              <option value="neutral">Neutre</option>
            </select>
            <div className="flex justify-end gap-0.5">
              <IconButton icon={ArrowUp} label="Monter" size="xs" disabled={i === 0} onClick={() => onChange({ ...block, items: moveItem(block.items, i, -1) })} />
              <IconButton icon={X} label="Supprimer l’indicateur" size="xs" onClick={() => onChange({ ...block, items: block.items.filter((_, j) => j !== i) })} />
            </div>
          </div>
        ))}
      </div>
      <AddRow label="Ajouter un indicateur" onClick={() => onChange({ ...block, items: [...block.items, kpiItem()] })} />
    </div>
  )
}

// ----- Liste --------------------------------------------------------------------------------

const STATUS_CYCLE: ListItemStatus[] = ['none', 'done', 'ongoing', 'todo']
const STATUS_META: Record<ListItemStatus, { label: string; icon: typeof Circle; color: string }> = {
  none: { label: 'Sans statut', icon: Circle, color: '#C3CBD8' },
  done: { label: 'Fait', icon: CheckCircle2, color: '#15803D' },
  ongoing: { label: 'En cours', icon: Clock3, color: '#B45309' },
  todo: { label: 'À faire', icon: Circle, color: '#77839A' },
}

export function ListEditor({ block, onChange }: Props<ListBlock>) {
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const focus = (i: number) => setTimeout(() => refs.current[i]?.focus(), 0)
  const update = (i: number, text: string) => onChange({ ...block, items: block.items.map((it, j) => (j === i ? { ...it, text } : it)) })
  const insertAfter = (i: number) => {
    const items = [...block.items]
    items.splice(i + 1, 0, { id: uid(), text: '', status: block.style === 'checklist' ? 'todo' : 'none' })
    onChange({ ...block, items })
    focus(i + 1)
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>, i: number) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      insertAfter(i)
    } else if (e.key === 'Backspace' && block.items[i].text === '' && block.items.length > 1) {
      e.preventDefault()
      onChange({ ...block, items: block.items.filter((_, j) => j !== i) })
      focus(Math.max(0, i - 1))
    }
  }
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <Segmented
          size="sm"
          value={block.style}
          onChange={(style) => onChange({ ...block, style })}
          options={[
            { value: 'bullets', label: 'Puces' },
            { value: 'numbered', label: 'Numérotée' },
            { value: 'checklist', label: 'Suivi d’actions' },
          ]}
        />
        <span className="text-xs text-ink-3">Entrée : nouvelle ligne — cliquez sur l’icône pour changer le statut</span>
      </div>
      <ul className="space-y-1">
        {block.items.map((item, i) => {
          const meta = STATUS_META[item.status]
          return (
            <li key={item.id} className="flex items-center gap-1.5">
              <button
                type="button"
                title={`Statut : ${meta.label}`}
                aria-label={`Statut : ${meta.label}`}
                onClick={() => onChange({ ...block, items: block.items.map((it, j) => (j === i ? { ...it, status: STATUS_CYCLE[(STATUS_CYCLE.indexOf(it.status) + 1) % STATUS_CYCLE.length] } : it)) })}
                className="grid size-8 shrink-0 place-items-center rounded-md hover:bg-canvas"
              >
                {item.status === 'none' ? <span className="size-2 rounded-sm" style={{ background: '#A3ACB9' }} /> : <meta.icon size={18} style={{ color: meta.color }} />}
              </button>
              <input
                ref={(el) => {
                  refs.current[i] = el
                }}
                className={cell}
                value={item.text}
                placeholder="Saisissez un élément"
                onChange={(e) => update(i, e.target.value)}
                onKeyDown={(e) => onKey(e, i)}
              />
              <IconButton icon={ArrowUp} label="Monter" size="xs" disabled={i === 0} onClick={() => onChange({ ...block, items: moveItem(block.items, i, -1) })} />
              <IconButton icon={ArrowDown} label="Descendre" size="xs" disabled={i === block.items.length - 1} onClick={() => onChange({ ...block, items: moveItem(block.items, i, 1) })} />
              <IconButton icon={X} label="Supprimer" size="xs" onClick={() => onChange({ ...block, items: block.items.filter((_, j) => j !== i) })} />
            </li>
          )
        })}
      </ul>
      <AddRow label="Ajouter un élément" onClick={() => insertAfter(block.items.length - 1)} />
    </div>
  )
}

// ----- Grille (tableaux et données de graphique) ----------------------------------------------

interface GridProps {
  columns: string[]
  rows: string[][]
  onChange: (columns: string[], rows: string[][]) => void
  columnExtras?: (index: number) => ReactNode
  minColumns?: number
}

function DataGrid({ columns, rows, onChange, columnExtras, minColumns = 1 }: GridProps) {
  /** Collage multi-cellules depuis Excel / Google Sheets à partir de la cellule ciblée. */
  const onPaste = (e: ClipboardEvent<HTMLInputElement>, r: number, c: number) => {
    const text = e.clipboardData.getData('text/plain')
    if (!text.includes('\t') && !text.includes('\n')) return
    e.preventDefault()
    const matrix = text
      .replace(/\r/g, '')
      .split('\n')
      .filter((l, i, arr) => l !== '' || i < arr.length - 1)
      .map((l) => l.split('\t'))
    const nextCols = [...columns]
    const nextRows = rows.map((row) => [...row])
    matrix.forEach((line, dr) => {
      line.forEach((value, dc) => {
        const col = c + dc
        while (nextCols.length <= col) nextCols.push('')
        const row = r + dr
        if (row === -1) nextCols[col] = value.trim()
        else {
          while (nextRows.length <= row) nextRows.push(Array(nextCols.length).fill(''))
          nextRows[row][col] = value.trim()
        }
      })
    })
    onChange(
      nextCols,
      nextRows.map((row) => [...row, ...Array(Math.max(0, nextCols.length - row.length)).fill('')]),
    )
    toast.success(`${matrix.length} ligne(s) collée(s)`)
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-line scrollbar-thin">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-canvas">
            {columns.map((col, c) => (
              <th key={c} className="min-w-[110px] border-b border-line p-1 text-left align-top">
                <div className="flex items-center gap-1">
                  <input className={clsx(cell, 'font-semibold')} value={col} placeholder={`Colonne ${c + 1}`} onChange={(e) => onChange(columns.map((x, i) => (i === c ? e.target.value : x)), rows)} onPaste={(e) => onPaste(e, -1, c)} aria-label={`En-tête de colonne ${c + 1}`} />
                  {columns.length > minColumns && (
                    <IconButton icon={X} label="Supprimer la colonne" size="xs" onClick={() => onChange(columns.filter((_, i) => i !== c), rows.map((row) => row.filter((_, i) => i !== c)))} />
                  )}
                </div>
                {columnExtras?.(c)}
              </th>
            ))}
            <th className="w-10 border-b border-line p-1">
              <IconButton icon={Plus} label="Ajouter une colonne" size="xs" onClick={() => onChange([...columns, ''], rows.map((row) => [...row, '']))} />
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} className="border-b border-line last:border-0">
              {columns.map((_, c) => (
                <td key={c} className="p-1">
                  <input className={clsx(cell, c === 0 && 'font-semibold', c > 0 && 'tnum')} value={row[c] ?? ''} onChange={(e) => onChange(columns, rows.map((x, i) => (i === r ? x.map((v, j) => (j === c ? e.target.value : v)) : x)))} onPaste={(e) => onPaste(e, r, c)} aria-label={`Ligne ${r + 1}, colonne ${c + 1}`} />
                </td>
              ))}
              <td className="w-10 p-1">
                <IconButton icon={X} label="Supprimer la ligne" size="xs" onClick={() => onChange(columns, rows.filter((_, i) => i !== r))} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PasteDialog({ open, onClose, onImport }: { open: boolean; onClose: () => void; onImport: (columns: string[], rows: string[][]) => void }) {
  const [value, setValue] = useState('')
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Coller depuis Excel"
      description="Copiez une plage de cellules (avec la ligne d’en-tête) dans Excel ou Google Sheets, puis collez-la ci-dessous."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              const parsed = parseTabular(value)
              if (!parsed) return toast.error('Aucune donnée tabulaire reconnue (séparateurs : tabulation ou point-virgule).')
              onImport(parsed.columns, parsed.rows)
              setValue('')
              onClose()
            }}
          >
            Importer
          </Button>
        </>
      }
    >
      <textarea className="field min-h-56 font-mono text-xs" value={value} onChange={(e) => setValue(e.target.value)} placeholder={'Agent\tEn cours\tSignés\nYanis\t1\t3'} />
    </Dialog>
  )
}

// ----- Tableau --------------------------------------------------------------------------------

export function TableEditor({ block, onChange }: Props<TableBlock>) {
  const [paste, setPaste] = useState(false)
  return (
    <div className="space-y-3">
      <DataGrid columns={block.columns} rows={block.rows} onChange={(columns, rows) => onChange({ ...block, columns, rows })} />
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" icon={Plus} onClick={() => onChange({ ...block, rows: [...block.rows, Array(block.columns.length).fill('')] })}>
          Ajouter une ligne
        </Button>
        <Button size="sm" variant="ghost" icon={ClipboardPaste} onClick={() => setPaste(true)}>
          Coller depuis Excel
        </Button>
        <label className="ml-auto inline-flex items-center gap-2 text-sm font-semibold text-ink-2">
          <input type="checkbox" className="size-4 accent-novia-600" checked={block.totalRow} onChange={(e) => onChange({ ...block, totalRow: e.target.checked })} />
          Ligne de total automatique
        </label>
      </div>
      <input className="field field-sm" value={block.caption} placeholder="Légende ou source (facultatif)" onChange={(e) => onChange({ ...block, caption: e.target.value })} />
      <p className="text-xs text-ink-3">Astuce : collez directement une plage Excel dans n’importe quelle cellule pour remplir le tableau.</p>
      <PasteDialog open={paste} onClose={() => setPaste(false)} onImport={(columns, rows) => onChange({ ...block, columns, rows })} />
    </div>
  )
}

// ----- Graphique --------------------------------------------------------------------------------

const CHART_TYPES: { value: ChartType; label: string }[] = [
  { value: 'bar', label: 'Barres' },
  { value: 'stacked', label: 'Empilées' },
  { value: 'horizontal', label: 'Horizontales' },
  { value: 'line', label: 'Courbes' },
  { value: 'donut', label: 'Anneau' },
]

export function ChartEditor({ block, onChange, ctx }: Props<ChartBlock>) {
  const [paste, setPaste] = useState(false)
  const columns = ['Catégorie', ...block.series.map((s) => s.name)]
  const rows = block.categories.map((cat, i) => [cat, ...block.series.map((s) => (s.values[i] === null || s.values[i] === undefined ? '' : String(s.values[i]).replace('.', ',')))])

  const fromGrid = (cols: string[], data: string[][]): ChartBlock => ({
    ...block,
    categories: data.map((r) => r[0] ?? ''),
    series: cols.slice(1).map((name, j) => ({
      id: block.series[j]?.id ?? uid(),
      name,
      color: block.series[j]?.color ?? null,
      values: data.map((r) => parseNumber(r[j + 1] ?? '')),
    })),
  })

  const fromTable = (table: TableBlock) => {
    const numericCols = table.columns.map((_, i) => i).filter((i) => i > 0 && table.rows.some((r) => parseNumber(r[i] ?? '') !== null))
    if (numericCols.length === 0) return toast.error('Ce tableau ne contient pas de colonne numérique.')
    onChange({
      ...block,
      categories: table.rows.map((r) => r[0] ?? ''),
      series: numericCols.map((c) => ({ id: uid(), name: table.columns[c], color: null, values: table.rows.map((r) => parseNumber(r[c] ?? '')) })),
    })
    toast.success('Graphique généré à partir du tableau')
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented size="sm" value={block.chartType} onChange={(chartType) => onChange({ ...block, chartType })} options={CHART_TYPES} />
        <input className="field field-sm w-24" value={block.unit} placeholder="Unité" onChange={(e) => onChange({ ...block, unit: e.target.value })} aria-label="Unité" />
        <label className="inline-flex items-center gap-2 text-sm font-semibold text-ink-2">
          <input type="checkbox" className="size-4 accent-novia-600" checked={block.showValues} onChange={(e) => onChange({ ...block, showValues: e.target.checked })} />
          Afficher les valeurs
        </label>
      </div>
      <DataGrid
        columns={columns}
        rows={rows}
        minColumns={2}
        onChange={(cols, data) => onChange(fromGrid(cols, data))}
        columnExtras={(c) =>
          c === 0 ? null : (
            <div className="mt-1 flex items-center gap-1 px-1">
              <span className="size-3 shrink-0 rounded-sm" style={{ background: seriesColor(block, c - 1, ctx.accent) }} />
              <select
                className="w-full rounded border-0 bg-transparent text-xs text-ink-2 focus:ring-0"
                value={block.series[c - 1]?.color ?? ''}
                aria-label="Couleur de la série"
                onChange={(e) => onChange({ ...block, series: block.series.map((s, j) => (j === c - 1 ? { ...s, color: e.target.value || null } : s)) })}
              >
                <option value="">Couleur automatique</option>
                <option value={ctx.accent}>Couleur du service</option>
                {CHART_SWATCHES.map((sw) => (
                  <option key={sw.value} value={sw.value}>
                    {sw.label}
                  </option>
                ))}
              </select>
            </div>
          )
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" icon={Plus} onClick={() => onChange({ ...block, categories: [...block.categories, ''], series: block.series.map((s) => ({ ...s, values: [...s.values, null] })) })}>
          Ajouter une catégorie
        </Button>
        <Button size="sm" variant="ghost" icon={ClipboardPaste} onClick={() => setPaste(true)}>
          Coller depuis Excel
        </Button>
        {ctx.tables.length > 0 && (
          <Select className="field-sm w-auto" value="" onChange={(e) => {
            const t = ctx.tables.find((x) => x.id === e.target.value)
            if (t) fromTable(t)
          }}>
            <option value="">Générer depuis un tableau…</option>
            {ctx.tables.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title || `Tableau (${t.columns.join(', ').slice(0, 40)})`}
              </option>
            ))}
          </Select>
        )}
      </div>
      {block.chartType === 'donut' && block.series.length > 1 && <p className="text-xs text-amber-800">L’anneau n’utilise que la première série.</p>}
      <PasteDialog open={paste} onClose={() => setPaste(false)} onImport={(cols, data) => onChange(fromGrid(cols, data))} />
    </div>
  )
}

// ----- Texte ------------------------------------------------------------------------------------

export function TextEditor({ block, onChange }: Props<TextBlock>) {
  return (
    <div className="space-y-2">
      <Segmented
        size="sm"
        value={block.tone}
        onChange={(tone) => onChange({ ...block, tone })}
        options={[
          { value: 'neutral', label: 'Texte' },
          { value: 'info', label: 'Information' },
          { value: 'success', label: 'Réussite' },
          { value: 'warning', label: 'Vigilance' },
          { value: 'danger', label: 'Alerte' },
        ]}
      />
      <textarea className="field min-h-24" value={block.text} placeholder="Message à afficher sur la diapositive" onChange={(e) => onChange({ ...block, text: e.target.value })} />
    </div>
  )
}

// ----- Image ------------------------------------------------------------------------------------

export function ImageEditor({ block, onChange, ctx }: Props<ImageBlock>) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [drag, setDrag] = useState(false)
  const upload = async (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) return toast.error('Choisissez un fichier image (PNG, JPEG, SVG…).')
    setBusy(true)
    try {
      onChange({ ...block, src: await ctx.uploadImage(file) })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Envoi impossible')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDrag(false)
          void upload(e.dataTransfer.files[0])
        }}
        className={clsx('relative grid min-h-36 place-items-center overflow-hidden rounded-xl border-2 border-dashed transition-colors', drag ? 'border-novia-400 bg-novia-50' : 'border-line-strong bg-canvas/50')}
      >
        {block.src ? (
          <img src={block.src} alt="" className="max-h-56 w-full object-contain" />
        ) : (
          <div className="p-6 text-center text-sm text-ink-2">
            <ImagePlus className="mx-auto mb-2 text-ink-3" />
            Glissez une image ici ou choisissez un fichier
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" icon={ImagePlus} loading={busy} onClick={() => input.current?.click()}>
          {block.src ? 'Remplacer l’image' : 'Choisir une image'}
        </Button>
        {block.src && (
          <Button size="sm" variant="ghost" icon={Trash2} onClick={() => onChange({ ...block, src: '' })}>
            Retirer
          </Button>
        )}
        <Segmented
          size="sm"
          value={block.fit}
          onChange={(fit) => onChange({ ...block, fit })}
          options={[
            { value: 'contain', label: 'Image entière' },
            { value: 'cover', label: 'Remplir le cadre' },
          ]}
        />
        <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => void upload(e.target.files?.[0])} />
      </div>
      <input className="field field-sm" value={block.caption} placeholder="Légende (facultatif)" onChange={(e) => onChange({ ...block, caption: e.target.value })} />
    </div>
  )
}

// ----- Événements ------------------------------------------------------------------------------

export function EventsEditor({ block, onChange, ctx }: Props<EventsBlock>) {
  const update = (i: number, patch: Partial<EventsBlock['items'][number]>) => onChange({ ...block, items: block.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) })
  return (
    <div>
      <div className="space-y-2">
        {block.items.map((item, i) => (
          <div key={item.id} className="grid grid-cols-2 gap-2 rounded-lg border border-line p-2 md:grid-cols-[150px_150px_100px_minmax(0,1fr)_32px]">
            <input type="date" className={clsx(cell, 'border-line')} value={item.date} onChange={(e) => update(i, { date: e.target.value })} aria-label="Date" />
            <input type="date" className={clsx(cell, 'border-line')} value={item.endDate} onChange={(e) => update(i, { endDate: e.target.value })} aria-label="Date de fin (facultatif)" title="Date de fin (facultatif)" />
            <input type="time" className={clsx(cell, 'border-line')} value={item.time} onChange={(e) => update(i, { time: e.target.value })} aria-label="Heure (facultatif)" />
            <div className="col-span-2 space-y-1 md:col-span-1">
              <input className={clsx(cell, 'font-semibold')} value={item.title} placeholder="Événement, échéance, rendez-vous…" onChange={(e) => update(i, { title: e.target.value })} aria-label="Intitulé" />
              <input className={clsx(cell, 'text-ink-2')} value={item.detail} placeholder="Précision (facultatif)" onChange={(e) => update(i, { detail: e.target.value })} aria-label="Précision" />
            </div>
            <IconButton icon={X} label="Supprimer l’événement" size="xs" onClick={() => onChange({ ...block, items: block.items.filter((_, j) => j !== i) })} />
          </div>
        ))}
      </div>
      {block.items.length === 0 && <p className="text-sm text-ink-3">Aucun événement pour l’instant.</p>}
      <AddRow label="Ajouter un événement" onClick={() => onChange({ ...block, items: [...block.items, { id: uid(), date: ctx.defaultEventDate, endDate: '', time: '', title: '', detail: '' }] })} />
    </div>
  )
}

// ----- Points d'attention ------------------------------------------------------------------------

export function IssuesEditor({ block, onChange }: Props<IssuesBlock>) {
  const update = (i: number, patch: Partial<IssuesBlock['items'][number]>) => onChange({ ...block, items: block.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) })
  return (
    <div>
      <div className="space-y-2">
        {block.items.map((item, i) => (
          <div key={item.id} className="rounded-lg border border-line p-2" style={{ borderLeft: `4px solid ${SEVERITY[item.severity].color}` }}>
            <div className="flex flex-wrap items-center gap-2">
              <select className={clsx(cell, 'w-36 border-line')} value={item.severity} onChange={(e) => update(i, { severity: e.target.value as typeof item.severity })} aria-label="Niveau">
                {Object.entries(SEVERITY).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
              <input className={clsx(cell, 'min-w-48 flex-1 font-semibold')} value={item.title} placeholder="Problème, point bloquant ou information" onChange={(e) => update(i, { title: e.target.value })} aria-label="Intitulé" />
              <IconButton icon={X} label="Supprimer" size="xs" onClick={() => onChange({ ...block, items: block.items.filter((_, j) => j !== i) })} />
            </div>
            <div className="mt-1 grid gap-1 md:grid-cols-2">
              <input className={clsx(cell, 'text-ink-2')} value={item.detail} placeholder="Détail (facultatif)" onChange={(e) => update(i, { detail: e.target.value })} aria-label="Détail" />
              <input className={clsx(cell, 'text-ink-2')} value={item.need} placeholder="Besoin d’accompagnement (facultatif)" onChange={(e) => update(i, { need: e.target.value })} aria-label="Besoin d’accompagnement" />
            </div>
          </div>
        ))}
      </div>
      {block.items.length === 0 && <p className="text-sm text-ink-3">Aucun point signalé.</p>}
      <AddRow label="Ajouter un point" onClick={() => onChange({ ...block, items: [...block.items, { id: uid(), title: '', detail: '', severity: 'attention', need: '' }] })} />
    </div>
  )
}

export function BlockBody({ block, onChange, ctx }: { block: Block; onChange: (b: Block) => void; ctx: EditorContext }) {
  switch (block.type) {
    case 'kpis':
      return <KpiEditor block={block} onChange={onChange} ctx={ctx} />
    case 'list':
      return <ListEditor block={block} onChange={onChange} ctx={ctx} />
    case 'table':
      return <TableEditor block={block} onChange={onChange} ctx={ctx} />
    case 'chart':
      return <ChartEditor block={block} onChange={onChange} ctx={ctx} />
    case 'text':
      return <TextEditor block={block} onChange={onChange} ctx={ctx} />
    case 'image':
      return <ImageEditor block={block} onChange={onChange} ctx={ctx} />
    case 'events':
      return <EventsEditor block={block} onChange={onChange} ctx={ctx} />
    case 'issues':
      return <IssuesEditor block={block} onChange={onChange} ctx={ctx} />
  }
}

