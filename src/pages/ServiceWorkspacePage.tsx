import { clsx } from 'clsx'
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  FileText,
  Gauge,
  Image as ImageIcon,
  Info,
  ListChecks,
  Lock,
  Maximize2,
  MoreVertical,
  MessageSquareWarning,
  Paperclip,
  PencilLine,
  Play,
  Plus,
  Send,
  StickyNote,
  Table2,
  Trash2,
  TriangleAlert,
  Type,
  Undo2,
  Upload,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { BlockBody, type EditorContext } from '@/components/editor/BlockEditors'
import { ServiceContentSlide } from '@/components/slides/DeckSlides'
import { ScaledSlide } from '@/components/slides/ScaledSlide'
import { useDeckData } from '@/components/slides/useDeckData'
import { StatusBadge } from '@/components/ui/Badges'
import { Button, IconButton } from '@/components/ui/Button'
import { confirmAction, Dialog } from '@/components/ui/Dialog'
import { Field, Switch } from '@/components/ui/Form'
import { Menu } from '@/components/ui/Menu'
import { EmptyState, ServiceIcon } from '@/components/ui/Misc'
import { BLOCK_LABELS, BLOCK_ORDER, blockHasContent, createBlock, slideHasContent } from '@/domain/blocks'
import { participatingServices } from '@/domain/deck'
import { defaultSlideSubtitle, defaultSlideTitle, meetingShortTitle, resolveSlideTitle, SLIDE_KIND_DESCRIPTIONS, SLIDE_KIND_LABELS } from '@/domain/periods'
import { canEditService, canReturn, canSubmit, canValidate, canWithdraw, isAdmin } from '@/domain/permissions'
import { submissionDeadline, submissionStatus } from '@/domain/selectors'
import { SUBMISSION_ORDER, SUBMISSION_STATUS } from '@/domain/status'
import type { Block, BlockType, BlockWidth, Slide, SlideKind, TableBlock } from '@/domain/types'
import { formatBytes, formatFullDate, formatTime } from '@/lib/format'
import { useBundle, useServices } from '@/store/hooks'
import { useAppStore } from '@/store/useAppStore'

const BLOCK_ICONS: Record<BlockType, LucideIcon> = {
  kpis: Gauge,
  list: ListChecks,
  table: Table2,
  chart: BarChart3,
  text: Type,
  image: ImageIcon,
  events: CalendarDays,
  issues: TriangleAlert,
}

const KIND_ICONS: Record<SlideKind, LucideIcon> = {
  overview: Gauge,
  achievements: CheckCircle2,
  forecast: CalendarDays,
  news: MessageSquareWarning,
  custom: StickyNote,
}

function StatusSteps({ status }: { status: keyof typeof SUBMISSION_STATUS }) {
  const current = SUBMISSION_ORDER.indexOf(status)
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm" aria-label="Avancement">
      {SUBMISSION_ORDER.map((s, i) => (
        <li key={s} className="flex items-center gap-2">
          <span className={clsx('inline-flex items-center gap-1.5 font-semibold', i <= current ? 'text-ink' : 'text-ink-3')} aria-current={i === current ? 'step' : undefined}>
            <span className={clsx('grid size-5 place-items-center rounded-full text-[11px] font-bold', i < current ? 'bg-novia-600 text-white' : i === current ? 'bg-white text-novia-700 ring-2 ring-novia-600' : 'bg-white text-ink-3 ring-1 ring-line-strong')}>
              {i < current ? '✓' : i + 1}
            </span>
            {SUBMISSION_STATUS[s].label}
          </span>
          {i < SUBMISSION_ORDER.length - 1 && <span className={clsx('h-px w-6', i < current ? 'bg-novia-600' : 'bg-line-strong')} aria-hidden />}
        </li>
      ))}
    </ol>
  )
}

function ReturnDialog({ open, onClose, onConfirm, reopen }: { open: boolean; onClose: () => void; onConfirm: (c: string) => void; reopen: boolean }) {
  const [comment, setComment] = useState('')
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={reopen ? 'Rouvrir le contenu' : 'Renvoyer pour modification'}
      description="Le contenu repasse « En cours » ; votre commentaire est affiché au responsable."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="primary" icon={Undo2} onClick={() => onConfirm(comment)}>
            {reopen ? 'Rouvrir' : 'Renvoyer'}
          </Button>
        </>
      }
    >
      <Field label="Commentaire (facultatif)">
        <textarea className="field min-h-24" value={comment} onChange={(e) => setComment(e.target.value)} />
      </Field>
    </Dialog>
  )
}

export function ServiceWorkspacePage() {
  const { meetingId, serviceId } = useParams()
  const user = useAppStore((s) => s.user)!
  const snapshot = useAppStore((s) => s.snapshot)!
  const updateSlide = useAppStore((s) => s.updateSlide)
  const addSlide = useAppStore((s) => s.addSlide)
  const deleteSlide = useAppStore((s) => s.deleteSlide)
  const duplicateSlide = useAppStore((s) => s.duplicateSlide)
  const moveSlide = useAppStore((s) => s.moveSlide)
  const setSubmissionStatus = useAppStore((s) => s.setSubmissionStatus)
  const uploadAttachment = useAppStore((s) => s.uploadAttachment)
  const deleteAttachment = useAppStore((s) => s.deleteAttachment)
  const uploadImage = useAppStore((s) => s.uploadImage)
  const bundle = useBundle(meetingId)
  const data = useDeckData(meetingId)
  const allServices = useServices()
  const navigate = useNavigate()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [returning, setReturning] = useState(false)
  const [bigPreview, setBigPreview] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const service = allServices.find((s) => s.id === serviceId)
  const slides = useMemo(() => (bundle?.slides ?? []).filter((s) => s.serviceId === serviceId).sort((a, b) => a.position - b.position), [bundle, serviceId])
  const selected = slides.find((s) => s.id === selectedId) ?? slides[0] ?? null

  useEffect(() => {
    if (!selectedId && slides[0]) setSelectedId(slides[0].id)
  }, [selectedId, slides])

  const known = snapshot.meetings.some((m) => m.id === meetingId)
  if (!service || !meetingId || !known) {
    return (
      <div className="panel">
        <EmptyState
          icon={Info}
          title="Espace introuvable"
          action={
            <Link to="/" className="font-semibold text-novia-600 hover:underline">
              Revenir au tableau de bord
            </Link>
          }
        >
          Cette réunion ou ce service n’existe pas (ou plus) dans vos données.
        </EmptyState>
      </div>
    )
  }
  if (!bundle || !data) return <div className="panel h-64 animate-pulse" />

  const meeting = bundle.meeting
  const status = submissionStatus(bundle, service.id)
  const submission = bundle.submissions.find((s) => s.serviceId === service.id)
  const editable = canEditService(user, service.id, status)
  const manager = snapshot.users.find((u) => u.id === service.managerId)
  const deadline = submissionDeadline(meeting, snapshot.settings)
  const participants = participatingServices(meeting, allServices)
  const position = participants.findIndex((s) => s.id === service.id)
  const prev = participants[position - 1]
  const next = participants[position + 1]
  const attachments = bundle.attachments.filter((a) => a.serviceId === service.id)
  const sourceMeeting = meeting.duplicatedFrom ? snapshot.meetings.find((m) => m.id === meeting.duplicatedFrom) : null
  const deckIndex = selected ? data.deck.entries.findIndex((e) => e.type === 'service' && e.slideId === selected.id) : -1
  const sectionIndex = data.deck.ranges[service.id]?.first ?? 0

  const ctx: EditorContext = {
    accent: service.palette.accent,
    defaultEventDate: data.periods.forecast.start,
    tables: (selected?.blocks.filter((b) => b.type === 'table') ?? []) as TableBlock[],
    uploadImage: (file) => uploadImage(file, meetingId, service.id),
  }

  const patchSlide = (patch: Partial<Slide>) => selected && updateSlide({ ...selected, ...patch })
  const patchBlock = (index: number, block: Block) => selected && updateSlide({ ...selected, blocks: selected.blocks.map((b, i) => (i === index ? block : b)) })
  const moveBlock = (index: number, dir: -1 | 1) => {
    if (!selected) return
    const target = index + dir
    if (target < 0 || target >= selected.blocks.length) return
    const blocks = [...selected.blocks]
    ;[blocks[index], blocks[target]] = [blocks[target], blocks[index]]
    updateSlide({ ...selected, blocks })
  }
  const removeBlock = async (index: number) => {
    if (!selected) return
    const block = selected.blocks[index]
    if (blockHasContent(block)) {
      const ok = await confirmAction({ title: 'Supprimer ce bloc ?', message: `Le bloc « ${block.title || BLOCK_LABELS[block.type].label} » et son contenu seront supprimés.`, confirmLabel: 'Supprimer', danger: true })
      if (!ok) return
    }
    updateSlide({ ...selected, blocks: selected.blocks.filter((_, i) => i !== index) })
  }

  const submit = async () => {
    const empty = slides.filter((s) => !s.hidden && !slideHasContent(s)).length
    if (empty > 0) {
      const ok = await confirmAction({ title: 'Soumettre malgré tout ?', message: `${empty} diapositive(s) ne contiennent encore aucune information. Elles afficheront « Rien à signaler » pendant la réunion.`, confirmLabel: 'Soumettre' })
      if (!ok) return
    }
    await setSubmissionStatus(meeting.id, service.id, 'submitted', '')
    toast.success('Contenu soumis à la direction')
  }

  const lockedMessage = !editable
    ? user.role === 'viewer'
      ? 'Consultation seule : votre profil permet de lire les contenus sans les modifier.'
      : user.role === 'manager' && user.serviceId !== service.id
        ? 'Consultation seule : cet espace appartient à un autre service.'
        : status === 'submitted'
          ? `Contenu soumis${submission?.submittedAt ? ` le ${formatFullDate(submission.submittedAt.slice(0, 10), false)}` : ''}, en attente de validation. Reprenez la modification pour le changer.`
          : 'Contenu validé par la direction : il est verrouillé jusqu’à sa réouverture.'
    : null

  return (
    <div className="space-y-6">
      {/* En-tête du service */}
      <section className="panel overflow-hidden" style={{ background: service.palette.tint, borderColor: service.palette.soft }}>
        <div className="flex flex-wrap items-start gap-5 p-5 sm:p-6">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl text-white" style={{ background: service.palette.accent }}>
            <ServiceIcon icon={service.icon} size={28} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold">{service.name}</h1>
              <StatusBadge status={status} />
            </div>
            <p className="mt-1 text-ink-2">
              {manager ? `${manager.fullName}, ${manager.jobTitle.toLowerCase()}` : 'Responsable à désigner'} —{' '}
              <Link to={`/reunions/${meeting.id}`} className="font-semibold text-novia-700 hover:underline">
                {meetingShortTitle(meeting)}
              </Link>
              , réunion du {formatFullDate(meeting.meetingDate, false)} à {formatTime(meeting.meetingTime)}
            </p>
            <div className="mt-4">
              <StatusSteps status={status} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canWithdraw(user, service.id, status) && (
              <Button icon={PencilLine} onClick={() => void setSubmissionStatus(meeting.id, service.id, 'in_progress').then(() => toast.success('Vous pouvez de nouveau modifier votre contenu'))}>
                Reprendre la modification
              </Button>
            )}
            {canReturn(user, status) && (
              <Button icon={Undo2} onClick={() => setReturning(true)}>
                {status === 'validated' ? 'Rouvrir' : 'Renvoyer'}
              </Button>
            )}
            {canValidate(user, status) && (
              <Button variant="primary" icon={CheckCircle2} onClick={() => void setSubmissionStatus(meeting.id, service.id, 'validated', '').then(() => toast.success(`${service.shortName} validé`))}>
                Valider
              </Button>
            )}
            {canSubmit(user, service.id, status) && (
              <Button variant="primary" icon={Send} onClick={submit}>
                {isAdmin(user) && !user.serviceId ? 'Marquer comme soumis' : 'Soumettre à la direction'}
              </Button>
            )}
          </div>
        </div>
        {((editable && (status === 'draft' || status === 'in_progress')) || (submission?.comment && (status === 'in_progress' || status === 'draft')) || lockedMessage) && (
        <div className="space-y-2 border-t px-5 py-3 text-sm sm:px-6" style={{ borderColor: service.palette.soft }}>
          {editable && (status === 'draft' || status === 'in_progress') && (
            <p className="text-ink-2">
              À transmettre avant le <strong className="font-semibold text-ink">{formatFullDate(deadline.date, false)}, {formatTime(deadline.time)}</strong>. Les modifications sont enregistrées automatiquement.
              {status === 'draft' && sourceMeeting && ` Le contenu a été repris de la semaine ${sourceMeeting.isoWeek} : mettez à jour les chiffres (la valeur précédente est conservée en rappel).`}
            </p>
          )}
          {submission?.comment && (status === 'in_progress' || status === 'draft') && (
            <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-amber-900">
              <MessageSquareWarning size={18} className="mt-0.5 shrink-0" />
              <span>
                <strong className="font-semibold">Commentaire de la direction : </strong>
                {submission.comment}
              </span>
            </p>
          )}
          {lockedMessage && (
            <p className="flex items-start gap-2 text-ink-2">
              <Lock size={16} className="mt-0.5 shrink-0" /> {lockedMessage}
            </p>
          )}
        </div>
        )}
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
        {/* Colonne gauche : aperçu, diapositives, pièces jointes */}
        <aside className="space-y-5 lg:sticky lg:top-20">
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-[15px] font-bold">Aperçu en direct</h2>
              <div className="flex gap-1">
                <IconButton icon={Maximize2} label="Agrandir l’aperçu" size="xs" onClick={() => setBigPreview(true)} disabled={!selected} />
                <IconButton icon={Play} label="Présenter cette section" size="xs" onClick={() => navigate(`/reunions/${meeting.id}/presentation?diapo=${sectionIndex + 1}`)} />
              </div>
            </div>
            {selected ? (
              <button className="block w-full text-left" onClick={() => setBigPreview(true)} aria-label="Agrandir l’aperçu">
                <ScaledSlide mode="preview" className="rounded-xl shadow-[var(--shadow-panel)] ring-1 ring-line">
                  <ServiceContentSlide data={data} slide={selected} index={deckIndex >= 0 ? deckIndex : 0} />
                </ScaledSlide>
              </button>
            ) : (
              <div className="grid aspect-video place-items-center rounded-xl bg-white text-sm text-ink-3 ring-1 ring-line">Aucune diapositive</div>
            )}
            {selected?.hidden && <p className="mt-2 text-xs font-semibold text-amber-800">Cette diapositive est masquée : elle ne sera pas présentée.</p>}
          </section>

          <section className="panel p-2">
            <div className="flex items-center justify-between px-2 pt-1 pb-2">
              <h2 className="text-[15px] font-bold">Diapositives</h2>
              {editable && (
                <Menu
                  items={(Object.keys(SLIDE_KIND_LABELS) as SlideKind[]).map((kind) => ({
                    label: SLIDE_KIND_LABELS[kind],
                    icon: KIND_ICONS[kind],
                    onSelect: async () => {
                      const slide = await addSlide(meeting.id, service.id, kind, kind === 'custom' ? 'Diapositive complémentaire' : '')
                      setSelectedId(slide.id)
                    },
                  }))}
                  trigger={(props) => (
                    <Button {...props} size="xs" variant="subtle" icon={Plus}>
                      Ajouter
                    </Button>
                  )}
                />
              )}
            </div>
            <ol className="space-y-1">
              {slides.map((s, i) => {
                const Icon = KIND_ICONS[s.kind]
                const filled = slideHasContent(s)
                const active = selected?.id === s.id
                return (
                  <li key={s.id}>
                    <div className={clsx('group flex items-center gap-2 rounded-lg px-2 py-2 transition-colors', active ? 'bg-novia-50 ring-1 ring-novia-200' : 'hover:bg-canvas')}>
                      <button className="flex min-w-0 flex-1 items-center gap-2.5 text-left" onClick={() => setSelectedId(s.id)} aria-current={active ? 'true' : undefined}>
                        <span className="grid size-8 shrink-0 place-items-center rounded-lg" style={{ background: service.palette.tint, color: service.palette.strong }}>
                          <Icon size={16} />
                        </span>
                        <span className="min-w-0">
                          <span className={clsx('block truncate text-sm font-semibold', s.hidden ? 'text-ink-3 line-through' : 'text-ink')}>
                            {i + 1}. {resolveSlideTitle(s, data.periods)}
                          </span>
                          <span className={clsx('block text-xs', filled ? 'text-emerald-700' : 'text-ink-3')}>{filled ? `${s.blocks.filter(blockHasContent).length} bloc(s) renseigné(s)` : 'À compléter'}</span>
                        </span>
                      </button>
                      {editable && (
                        <Menu
                          items={[
                            { label: 'Monter', icon: ArrowUp, disabled: i === 0, onSelect: () => moveSlide(meeting.id, s.id, -1) },
                            { label: 'Descendre', icon: ArrowDown, disabled: i === slides.length - 1, onSelect: () => moveSlide(meeting.id, s.id, 1) },
                            { label: 'Dupliquer', icon: Copy, onSelect: () => duplicateSlide(meeting.id, s.id) },
                            { label: s.hidden ? 'Afficher dans la présentation' : 'Masquer de la présentation', icon: s.hidden ? Eye : EyeOff, onSelect: () => updateSlide({ ...s, hidden: !s.hidden }) },
                            'separator',
                            {
                              label: 'Supprimer',
                              icon: Trash2,
                              danger: true,
                              onSelect: async () => {
                                const ok = await confirmAction({ title: 'Supprimer la diapositive ?', message: `« ${resolveSlideTitle(s, data.periods)} » sera supprimée de cette réunion.`, confirmLabel: 'Supprimer', danger: true })
                                if (ok) {
                                  await deleteSlide(meeting.id, s.id)
                                  setSelectedId(null)
                                }
                              },
                            },
                          ]}
                          trigger={(props) => <IconButton {...props} icon={MoreVertical} label="Actions de la diapositive" size="xs" />}
                        />
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
          </section>

          <section className="panel p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="inline-flex items-center gap-2 text-[15px] font-bold">
                <Paperclip size={16} /> Pièces jointes
              </h2>
              {editable && (
                <Button size="xs" variant="subtle" icon={Upload} onClick={() => fileInput.current?.click()}>
                  Ajouter
                </Button>
              )}
              <input
                ref={fileInput}
                type="file"
                multiple
                className="hidden"
                onChange={async (e) => {
                  const files = Array.from(e.target.files ?? [])
                  e.target.value = ''
                  for (const f of files) await uploadAttachment(f, meeting.id, service.id)
                }}
              />
            </div>
            {attachments.length === 0 ? (
              <p className="text-sm text-ink-3">Tableaux Excel, comptes rendus, exports… joints à la réunion pour consultation.</p>
            ) : (
              <ul className="space-y-1.5">
                {attachments.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 rounded-lg bg-canvas px-2.5 py-2 text-sm">
                    <FileText size={16} className="shrink-0 text-ink-3" />
                    <a href={a.url} download={a.fileName} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-semibold text-novia-700 hover:underline">
                      {a.fileName}
                    </a>
                    <span className="shrink-0 text-xs text-ink-3">{formatBytes(a.sizeBytes)}</span>
                    {editable && <IconButton icon={Trash2} label={`Supprimer ${a.fileName}`} size="xs" onClick={() => deleteAttachment(a)} />}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>

        {/* Colonne principale : édition */}
        <div className="min-w-0 space-y-5">
          {!selected ? (
            <div className="panel">
              <EmptyState icon={Plus} title="Aucune diapositive pour ce service">
                Ajoutez une diapositive pour commencer la saisie.
              </EmptyState>
            </div>
          ) : (
            <fieldset disabled={!editable} className="min-w-0 space-y-5">
              <section className="panel p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm text-ink-2">
                    <strong className="font-semibold text-ink">{SLIDE_KIND_LABELS[selected.kind]}</strong> — {SLIDE_KIND_DESCRIPTIONS[selected.kind]}
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Titre" hint="Laissez vide pour le titre automatique.">
                    <input className="field" value={selected.title} placeholder={defaultSlideTitle(selected.kind, data.periods)} onChange={(e) => patchSlide({ title: e.target.value })} />
                  </Field>
                  <Field label="Sous-titre" hint="Par défaut : la période, recalculée chaque semaine.">
                    <input className="field" value={selected.subtitle} placeholder={defaultSlideSubtitle(selected.kind, data.periods)} onChange={(e) => patchSlide({ subtitle: e.target.value })} />
                  </Field>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <Switch checked={!selected.hidden} onChange={(v) => patchSlide({ hidden: !v })} label="Présenter cette diapositive" description="Décochez pour la conserver sans l’afficher en réunion." disabled={!editable} />
                  <Field label="Notes de l’intervenant">
                    <textarea className="field min-h-[42px]" rows={1} value={selected.notes} placeholder="Points à dire à l’oral (non affichés)" onChange={(e) => patchSlide({ notes: e.target.value })} />
                  </Field>
                </div>
              </section>

              {selected.blocks.map((block, index) => {
                const Icon = BLOCK_ICONS[block.type]
                return (
                  <section key={block.id} className="panel">
                    <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-canvas text-ink-2" title={BLOCK_LABELS[block.type].label}>
                        <Icon size={16} />
                      </span>
                      <span className="text-sm font-semibold text-ink-2">{BLOCK_LABELS[block.type].label}</span>
                      <input className="field field-sm min-w-40 flex-1" value={block.title} placeholder="Titre du bloc (facultatif)" onChange={(e) => patchBlock(index, { ...block, title: e.target.value })} aria-label="Titre du bloc" />
                      <select className="field field-sm w-auto" value={block.width} onChange={(e) => patchBlock(index, { ...block, width: e.target.value as BlockWidth })} aria-label="Largeur sur la diapositive" title="Largeur sur la diapositive">
                        <option value="auto">Largeur auto</option>
                        <option value="full">Pleine largeur</option>
                        <option value="half">Demi-largeur</option>
                      </select>
                      <IconButton icon={ArrowUp} label="Monter le bloc" size="xs" disabled={index === 0} onClick={() => moveBlock(index, -1)} />
                      <IconButton icon={ArrowDown} label="Descendre le bloc" size="xs" disabled={index === selected.blocks.length - 1} onClick={() => moveBlock(index, 1)} />
                      <IconButton icon={Trash2} label="Supprimer le bloc" size="xs" onClick={() => void removeBlock(index)} />
                    </div>
                    <div className="p-4">
                      <BlockBody block={block} ctx={ctx} onChange={(b) => patchBlock(index, b)} />
                    </div>
                  </section>
                )
              })}

              {editable && (
                <section className="rounded-[var(--radius-panel)] border border-dashed border-line-strong p-4">
                  <h3 className="mb-3 text-sm font-semibold text-ink-2">Ajouter un bloc à la diapositive</h3>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {BLOCK_ORDER.map((type) => {
                      const Icon = BLOCK_ICONS[type]
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => updateSlide({ ...selected, blocks: [...selected.blocks, createBlock(type)] })}
                          className="flex items-start gap-2.5 rounded-xl bg-white p-3 text-left ring-1 ring-line transition-colors hover:ring-novia-300"
                          title={BLOCK_LABELS[type].description}
                        >
                          <Icon size={18} className="mt-0.5 shrink-0" style={{ color: service.palette.accent }} />
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold">{BLOCK_LABELS[type].label}</span>
                            <span className="block text-xs leading-snug text-ink-3">{BLOCK_LABELS[type].description}</span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </section>
              )}
            </fieldset>
          )}

          <nav className="flex items-center justify-between gap-3 pt-2" aria-label="Services">
            {prev ? (
              <Link to={`/reunions/${meeting.id}/services/${prev.id}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-novia-700 hover:underline">
                <ChevronLeft size={16} /> {prev.shortName}
              </Link>
            ) : (
              <span />
            )}
            {next && (
              <Link to={`/reunions/${meeting.id}/services/${next.id}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-novia-700 hover:underline">
                {next.shortName} <ChevronRight size={16} />
              </Link>
            )}
          </nav>
        </div>
      </div>

      <Dialog open={bigPreview && !!selected} onClose={() => setBigPreview(false)} title={selected ? resolveSlideTitle(selected, data.periods) : ''} size="xl">
        {selected && (
          <ScaledSlide mode="preview" className="rounded-xl ring-1 ring-line">
            <ServiceContentSlide data={data} slide={selected} index={deckIndex >= 0 ? deckIndex : 0} />
          </ScaledSlide>
        )}
      </Dialog>
      <ReturnDialog
        open={returning}
        reopen={status === 'validated'}
        onClose={() => setReturning(false)}
        onConfirm={(comment) => {
          void setSubmissionStatus(meeting.id, service.id, 'in_progress', comment)
          toast.success(status === 'validated' ? 'Contenu rouvert' : 'Contenu renvoyé au responsable')
          setReturning(false)
        }}
      />
    </div>
  )
}
