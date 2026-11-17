import { parseNumber } from '@/lib/format'
import { uid } from '@/lib/ids'
import type {
  Block,
  BlockType,
  ChartBlock,
  EventsBlock,
  ImageBlock,
  IssuesBlock,
  KpiBlock,
  KpiItem,
  ListBlock,
  Slide,
  TableBlock,
  TextBlock,
} from './types'

// ---------------------------------------------------------------------------
// Catalogue et fabriques de blocs de contenu
// ---------------------------------------------------------------------------

export const BLOCK_LABELS: Record<BlockType, { label: string; description: string }> = {
  kpis: { label: 'Indicateurs', description: 'Chiffres clés avec rappel de la semaine précédente' },
  list: { label: 'Liste', description: 'Réalisations, actions, objectifs' },
  table: { label: 'Tableau', description: 'Statistiques, suivi par personne ou par groupe' },
  chart: { label: 'Graphique', description: 'Barres, courbes ou anneau' },
  text: { label: 'Texte', description: 'Paragraphe ou message important' },
  image: { label: 'Image', description: 'Capture, photo ou visuel' },
  events: { label: 'Événements', description: 'Échéances et rendez-vous datés' },
  issues: { label: 'Points d’attention', description: 'Difficultés, blocages et besoins' },
}

export const BLOCK_ORDER: BlockType[] = ['kpis', 'list', 'table', 'chart', 'events', 'issues', 'text', 'image']

export const kpiItem = (patch: Partial<KpiItem> = {}): KpiItem => ({
  id: uid(),
  label: '',
  value: '',
  previous: '',
  unit: '',
  target: '',
  goodWhen: 'up',
  ...patch,
})

export function createBlock(type: BlockType): Block {
  const base = { id: uid(), title: '', width: 'auto' as const }
  switch (type) {
    case 'kpis':
      return { ...base, type, items: [kpiItem({ label: 'Indicateur' })] } satisfies KpiBlock
    case 'list':
      return { ...base, type, style: 'bullets', items: [{ id: uid(), text: '', status: 'none' }] } satisfies ListBlock
    case 'table':
      return {
        ...base,
        type,
        columns: ['Élément', 'Valeur'],
        rows: [
          ['', ''],
          ['', ''],
        ],
        totalRow: false,
        caption: '',
      } satisfies TableBlock
    case 'chart':
      return {
        ...base,
        type,
        chartType: 'bar',
        categories: ['A', 'B', 'C'],
        series: [{ id: uid(), name: 'Série 1', color: null, values: [0, 0, 0] }],
        unit: '',
        showValues: true,
      } satisfies ChartBlock
    case 'text':
      return { ...base, type, text: '', tone: 'neutral' } satisfies TextBlock
    case 'image':
      return { ...base, type, src: '', caption: '', fit: 'contain' } satisfies ImageBlock
    case 'events':
      return { ...base, type, items: [] } satisfies EventsBlock
    case 'issues':
      return { ...base, type, items: [] } satisfies IssuesBlock
  }
}

/** Copie profonde d'un bloc avec de nouveaux identifiants. */
export function cloneBlock<T extends Block>(block: T, opts: { carryKpis?: boolean } = {}): T {
  const copy = structuredClone(block) as T
  copy.id = uid()
  if (copy.type === 'kpis') {
    copy.items = copy.items.map((item) => ({
      ...item,
      id: uid(),
      // La valeur de la semaine passée devient le rappel de la nouvelle semaine.
      previous: opts.carryKpis && item.value.trim() ? item.value : item.previous,
    }))
  }
  if (copy.type === 'list') copy.items = copy.items.map((i) => ({ ...i, id: uid() }))
  if (copy.type === 'events') copy.items = copy.items.map((i) => ({ ...i, id: uid() }))
  if (copy.type === 'issues') copy.items = copy.items.map((i) => ({ ...i, id: uid() }))
  if (copy.type === 'chart') copy.series = copy.series.map((s) => ({ ...s, id: uid() }))
  return copy
}

/** Un bloc contient-il une information réellement saisie ? */
export function blockHasContent(block: Block): boolean {
  switch (block.type) {
    case 'kpis':
      return block.items.some((i) => i.value.trim() !== '')
    case 'list':
      return block.items.some((i) => i.text.trim() !== '')
    case 'table':
      return block.rows.some((r) => r.some((c) => c.trim() !== ''))
    case 'chart':
      return block.categories.length > 0 && block.series.some((s) => s.values.some((v) => v !== null && v !== 0))
    case 'text':
      return block.text.trim() !== ''
    case 'image':
      return block.src !== ''
    case 'events':
      return block.items.some((i) => i.title.trim() !== '')
    case 'issues':
      return block.items.some((i) => i.title.trim() !== '')
  }
}

export const slideHasContent = (slide: Slide) => slide.blocks.some(blockHasContent)

/** Ligne de total : somme des colonnes numériques (la 1re colonne porte le libellé). */
export function computeTotalRow(table: Pick<TableBlock, 'columns' | 'rows'>): string[] {
  return table.columns.map((_, col) => {
    if (col === 0) return 'Total'
    const values = table.rows.map((r) => parseNumber(r[col] ?? '')).filter((v): v is number => v !== null)
    const hasText = table.rows.some((r) => (r[col] ?? '').trim() !== '' && parseNumber(r[col]) === null)
    if (values.length === 0 || hasText) return ''
    const sum = values.reduce((a, b) => a + b, 0)
    return Number.isInteger(sum) ? String(sum) : sum.toFixed(1).replace('.', ',')
  })
}

/** Une colonne est-elle numérique (pour l'alignement à droite) ? */
export function isNumericColumn(rows: string[][], col: number): boolean {
  const cells = rows.map((r) => (r[col] ?? '').trim()).filter(Boolean)
  return cells.length > 0 && cells.every((c) => parseNumber(c) !== null || /^\d+([,.]\d+)?\s?%$/.test(c))
}

/**
 * Analyse un collage depuis Excel / Google Sheets (valeurs séparées par des tabulations).
 * La première ligne devient l'en-tête.
 */
export function parseTabular(text: string): { columns: string[]; rows: string[][] } | null {
  const lines = text
    .replace(/\r/g, '')
    .split('\n')
    .filter((l) => l.trim() !== '')
  if (lines.length === 0) return null
  const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : null
  if (!sep) return null
  const matrix = lines.map((l) => l.split(sep).map((c) => c.trim()))
  const width = Math.max(...matrix.map((r) => r.length))
  const normalized = matrix.map((r) => [...r, ...Array(width - r.length).fill('')])
  return { columns: normalized[0], rows: normalized.slice(1) }
}

// ---------------------------------------------------------------------------
// Couleurs des graphiques
// Palette catégorielle validée (ordre fixe, contrôle daltonisme) + couleurs
// d'état réservées aux statuts (réussite, vigilance, échec…).
// ---------------------------------------------------------------------------

export const CATEGORICAL = ['#2A78D6', '#EB6834', '#1BAF7A', '#EDA100', '#E87BA4', '#008300', '#6250D6', '#E34948']

export const CHART_SWATCHES: { value: string; label: string }[] = [
  { value: '#2A78D6', label: 'Bleu' },
  { value: '#EB6834', label: 'Orange' },
  { value: '#1BAF7A', label: 'Vert d’eau' },
  { value: '#EDA100', label: 'Jaune' },
  { value: '#E87BA4', label: 'Rose' },
  { value: '#008300', label: 'Vert' },
  { value: '#6250D6', label: 'Violet' },
  { value: '#E34948', label: 'Rouge' },
  { value: '#0CA30C', label: 'État : favorable' },
  { value: '#FAB219', label: 'État : vigilance' },
  { value: '#D03B3B', label: 'État : critique' },
  { value: '#A3ACB9', label: 'Neutre' },
]

/** Couleur d'une série : couleur choisie, sinon couleur du service (1 série) ou palette catégorielle. */
export function seriesColor(chart: ChartBlock, index: number, serviceAccent: string): string {
  const explicit = chart.series[index]?.color
  if (explicit) return explicit
  if (chart.series.length === 1 && chart.chartType !== 'donut') return serviceAccent
  return CATEGORICAL[index % CATEGORICAL.length]
}

/** Couleurs des parts d'un anneau (une seule série, une couleur par catégorie). */
export const donutColor = (index: number) => CATEGORICAL[index % CATEGORICAL.length]
