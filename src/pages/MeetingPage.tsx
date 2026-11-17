import { clsx } from 'clsx'
import { Archive, ArrowDown, ArrowUp, CalendarCheck2, CalendarClock, CheckCircle2, ChevronRight, Copy, MoreHorizontal, Pencil, Play, RotateCcw, Sparkles, Timer, Trash2, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ExportMenu } from '@/components/meeting/ExportMenu'
import { NewMeetingDialog } from '@/components/meeting/NewMeetingDialog'
import { SlideThumb } from '@/components/slides/SlideThumb'
import { useDeckData } from '@/components/slides/useDeckData'
import { MeetingStatusBadge, StatusBadge } from '@/components/ui/Badges'
import { Button, IconButton } from '@/components/ui/Button'
import { confirmAction, Dialog } from '@/components/ui/Dialog'
import { Field, Segmented, Select, Stepper } from '@/components/ui/Form'
import { Menu } from '@/components/ui/Menu'
import { Avatar, EmptyState, ServiceBadge } from '@/components/ui/Misc'
import { participatingServices, plannedMinutes } from '@/domain/deck'
import { computePeriods, FORECAST_REFERENCE_LABELS, meetingTitle } from '@/domain/periods'
import { canReturn, canValidate, isAdmin } from '@/domain/permissions'
import { serviceFill, submissionStatus } from '@/domain/selectors'
import type { ForecastReference, MeetingStatus } from '@/domain/types'
import { formatFullDateCap, formatTime } from '@/lib/format'
import { useBundle, useServices } from '@/store/hooks'
import { useAppStore } from '@/store/useAppStore'

type Tab = 'services' | 'slides' | 'settings'

function ReturnDialog({ open, onClose, onConfirm, serviceName }: { open: boolean; onClose: () => void; onConfirm: (comment: string) => void; serviceName: string }) {
  const [comment, setComment] = useState('')
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Renvoyer pour modification — ${serviceName}`}
      description="Le responsable retrouve son contenu en « En cours » avec votre commentaire."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="primary"
            icon={Undo2}
            onClick={() => {
              onConfirm(comment)
              setComment('')
            }}
          >
            Renvoyer
          </Button>
        </>
      }
    >
      <Field label="Commentaire pour le responsable">
        <textarea className="field min-h-28" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Ex. : merci d’ajouter les chiffres de la semaine 46 dans l’état global." />
      </Field>
    </Dialog>
  )
}

export function MeetingPage() {
  const { meetingId } = useParams()
  const user = useAppStore((s) => s.user)!
  const snapshot = useAppStore((s) => s.snapshot)!
  const updateMeeting = useAppStore((s) => s.updateMeeting)
  const deleteMeeting = useAppStore((s) => s.deleteMeeting)
  const setSubmissionStatus = useAppStore((s) => s.setSubmissionStatus)
  const bundle = useBundle(meetingId)
  const data = useDeckData(meetingId)
  const allServices = useServices()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('services')
  const [duplicate, setDuplicate] = useState(false)
  const [returning, setReturning] = useState<string | null>(null)
  const admin = isAdmin(user)

  const listed = snapshot.meetings.find((m) => m.id === meetingId)
  if (!listed) {
    return (
      <div className="panel">
        <EmptyState icon={CalendarClock} title="Réunion introuvable">
          Cette réunion n’existe plus. Consultez l’historique pour retrouver les autres semaines.
        </EmptyState>
      </div>
    )
  }
  if (!bundle || !data) return <div className="panel h-64 animate-pulse" />

  const meeting = bundle.meeting
  const services = participatingServices(meeting, allServices)
  const periods = computePeriods(meeting)
  const planned = plannedMinutes(meeting)
  const managerOf = (id: string | null) => snapshot.users.find((u) => u.id === id)

  const setStatus = (status: MeetingStatus, message: string) => {
    void updateMeeting(meeting.id, { status })
    toast.success(message)
  }

  const remove = async () => {
    const ok = await confirmAction({ title: 'Supprimer cette réunion ?', message: `La Flash Synchro de la semaine ${meeting.isoWeek} et toutes ses diapositives seront définitivement supprimées.`, confirmLabel: 'Supprimer', danger: true })
    if (!ok) return
    await deleteMeeting(meeting.id)
    toast.success('Réunion supprimée')
    navigate('/historique')
  }

  const launch = (index = 0) => {
    void document.documentElement.requestFullscreen?.().catch(() => undefined)
    navigate(`/reunions/${meeting.id}/presentation${index ? `?diapo=${index + 1}` : ''}`)
  }

  const returningService = services.find((s) => s.id === returning)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <MeetingStatusBadge status={meeting.status} />
            {meeting.duplicatedFrom && <span className="text-sm text-ink-3">Créée par duplication</span>}
          </div>
          <h1 className="mt-2 text-2xl leading-tight font-bold sm:text-[28px]">{meetingTitle(meeting)}</h1>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[15px] text-ink-2">
            <span className="inline-flex items-center gap-2">
              <CalendarClock size={17} className="text-novia-600" />
              {formatFullDateCap(meeting.meetingDate, true)} à {formatTime(meeting.meetingTime)}
            </span>
            <span className="inline-flex items-center gap-2">
              <Timer size={17} className="text-novia-600" />
              {planned} minutes prévues{meeting.timing ? `, ${Math.round(meeting.timing.totalSeconds / 60)} réalisées` : ''}
            </span>
          </div>
          <p className="mt-1 text-[15px] text-ink-2">
            Réalisations {periods.review.code} : {periods.review.label.toLowerCase()} ({periods.review.range}) — Prévisions {periods.forecast.code} : {periods.forecast.label.toLowerCase()} ({periods.forecast.rangeShort})
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportMenu meetingId={meeting.id} />
          {admin && (
            <Menu
              items={[
                { label: 'Dupliquer vers une autre semaine', icon: Copy, onSelect: () => setDuplicate(true) },
                'separator',
                { label: 'Marquer comme prête', icon: Sparkles, onSelect: () => setStatus('ready', 'Réunion marquée comme prête'), disabled: meeting.status === 'ready' },
                { label: 'Marquer comme tenue', icon: CalendarCheck2, onSelect: () => setStatus('held', 'Réunion marquée comme tenue'), disabled: meeting.status === 'held' },
                { label: 'Archiver', icon: Archive, onSelect: () => setStatus('archived', 'Réunion archivée'), disabled: meeting.status === 'archived' },
                { label: 'Remettre en préparation', icon: RotateCcw, onSelect: () => setStatus('preparation', 'Réunion remise en préparation'), disabled: meeting.status === 'preparation' },
                'separator',
                { label: 'Supprimer la réunion', icon: Trash2, danger: true, onSelect: remove },
              ]}
              trigger={(props) => <IconButton {...props} icon={MoreHorizontal} label="Plus d’actions" variant="secondary" size="md" />}
            />
          )}
          <Button variant="primary" icon={Play} onClick={() => launch()}>
            Lancer la présentation
          </Button>
        </div>
      </div>

      <div className="flex gap-1 border-b border-line" role="tablist">
        {(
          [
            ['services', 'Services'],
            ['slides', `Diapositives (${data.deck.entries.length})`],
            ...(admin ? ([['settings', 'Réglages de la réunion']] as const) : []),
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={clsx('-mb-px border-b-2 px-4 py-2.5 text-[15px] font-semibold transition-colors', tab === key ? 'border-novia-600 text-novia-700' : 'border-transparent text-ink-2 hover:text-ink')}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'services' && (
        <section className="panel overflow-hidden">
          <div className="hidden grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_130px_120px_150px_minmax(0,1.2fr)] gap-4 border-b border-line bg-canvas/60 px-5 py-2.5 text-[13px] font-semibold text-ink-3 lg:grid">
            <span>Service</span>
            <span>Responsable</span>
            <span>Statut</span>
            <span>Diapositives</span>
            <span>Temps de parole</span>
            <span className="text-right">Actions</span>
          </div>
          <ul className="divide-y divide-line">
            {services.map((s) => {
              const status = submissionStatus(bundle, s.id)
              const fill = serviceFill(bundle, s.id)
              const sub = bundle.submissions.find((x) => x.serviceId === s.id)
              const manager = managerOf(s.managerId)
              return (
                <li key={s.id} className="grid grid-cols-2 items-center gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_130px_120px_150px_minmax(0,1.2fr)]">
                  <div className="col-span-2 lg:col-span-1">
                    <ServiceBadge service={s} />
                    {sub?.comment && (status === 'in_progress' || status === 'draft') && <p className="mt-1 truncate text-xs text-amber-800" title={sub.comment}>Renvoyé : {sub.comment}</p>}
                  </div>
                  <span className="flex min-w-0 items-center gap-2 text-sm text-ink-2">
                    {manager && <Avatar name={manager.fullName} color={s.palette.accent} size={26} />}
                    <span className="truncate">{manager?.fullName ?? '—'}</span>
                  </span>
                  <span>
                    <StatusBadge status={status} size="sm" />
                  </span>
                  <span className="text-sm text-ink-2 tnum">
                    {fill.filled} / {fill.total} renseignée{fill.filled > 1 ? 's' : ''}
                  </span>
                  <span>
                    {admin ? (
                      <Stepper label={`Durée ${s.shortName}`} value={meeting.durations[s.id] ?? s.durationMinutes} min={1} max={60} suffix="min" onChange={(v) => updateMeeting(meeting.id, { durations: { ...meeting.durations, [s.id]: v } })} />
                    ) : (
                      <span className="text-sm font-semibold">{meeting.durations[s.id] ?? s.durationMinutes} min</span>
                    )}
                  </span>
                  <span className="col-span-2 flex flex-wrap items-center justify-end gap-2 lg:col-span-1">
                    {canValidate(user, status) && (
                      <Button size="sm" variant="primary" icon={CheckCircle2} onClick={() => void setSubmissionStatus(meeting.id, s.id, 'validated', '').then(() => toast.success(`${s.shortName} validé`))}>
                        Valider
                      </Button>
                    )}
                    {canReturn(user, status) && (
                      <Button size="sm" variant="ghost" icon={Undo2} onClick={() => setReturning(s.id)}>
                        Renvoyer
                      </Button>
                    )}
                    <Link to={`/reunions/${meeting.id}/services/${s.id}`} className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-sm font-semibold text-novia-700 hover:bg-novia-50">
                      Ouvrir <ChevronRight size={16} />
                    </Link>
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {tab === 'slides' && (
        <div className="space-y-8">
          {[
            { key: 'intro', title: 'Ouverture', serviceId: null as string | null },
            ...services.map((s) => ({ key: s.id, title: s.name, serviceId: s.id as string | null })),
            { key: 'end', title: 'Clôture', serviceId: null as string | null },
          ].map((group) => {
            const indexes = data.deck.entries
              .map((e, i) => ({ e, i }))
              .filter(({ e }) => {
                if (group.key === 'intro') return e.type === 'cover' || e.type === 'agenda'
                if (group.key === 'end') return e.type === 'closing'
                return (e.type === 'section' || e.type === 'service') && e.serviceId === group.serviceId
              })
            const service = services.find((s) => s.id === group.serviceId)
            return (
              <section key={group.key}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  {service ? <ServiceBadge service={service} /> : <h2 className="text-[17px] font-bold">{group.title}</h2>}
                  {service && (
                    <Link to={`/reunions/${meeting.id}/services/${service.id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-novia-700 hover:underline">
                      <Pencil size={14} /> Modifier
                    </Link>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
                  {indexes.map(({ e, i }) => (
                    <button key={e.key} onClick={() => launch(i)} className="group text-left" title="Présenter à partir de cette diapositive">
                      <SlideThumb data={data} index={i} className="transition-shadow group-hover:ring-2 group-hover:ring-novia-400" />
                      <div className="mt-1.5 text-xs font-semibold text-ink-3">Diapositive {i + 1}</div>
                    </button>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}

      {tab === 'settings' && admin && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="panel space-y-5 p-5 sm:p-6">
            <h2 className="text-[17px] font-bold">Date et périodes</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Date de la réunion">
                <input type="date" className="field" value={meeting.meetingDate} onChange={(e) => e.target.value && updateMeeting(meeting.id, { meetingDate: e.target.value })} />
              </Field>
              <Field label="Heure de début">
                <input type="time" className="field" value={meeting.meetingTime} onChange={(e) => e.target.value && updateMeeting(meeting.id, { meetingTime: e.target.value })} />
              </Field>
            </div>
            <div>
              <span className="label">Période des réalisations</span>
              <Segmented
                value={String(meeting.reviewWeeks)}
                onChange={(v) => updateMeeting(meeting.id, { reviewWeeks: Number(v) })}
                options={[
                  { value: '1', label: '1 semaine' },
                  { value: '2', label: '2 semaines' },
                  { value: '3', label: '3 semaines' },
                  { value: '4', label: '4 semaines' },
                ]}
              />
              <p className="mt-2 text-sm text-ink-2">
                {periods.review.label} — {periods.review.range}
              </p>
            </div>
            <Field label="Semaine des prévisions">
              <Select value={meeting.forecastReference} onChange={(e) => updateMeeting(meeting.id, { forecastReference: e.target.value as ForecastReference })}>
                {Object.entries(FORECAST_REFERENCE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Titre affiché" hint="Laissez vide pour le titre automatique.">
              <input className="field" value={meeting.title ?? ''} placeholder={meetingTitle({ ...meeting, title: null })} onChange={(e) => updateMeeting(meeting.id, { title: e.target.value || null })} />
            </Field>
            <Field label="Notes internes">
              <textarea className="field min-h-24" value={meeting.notes} onChange={(e) => updateMeeting(meeting.id, { notes: e.target.value })} placeholder="Points à aborder, invités…" />
            </Field>
          </section>

          <section className="panel p-5 sm:p-6">
            <h2 className="text-[17px] font-bold">Services participants et ordre de passage</h2>
            <p className="mt-1 mb-4 text-sm text-ink-2">Le temps de parole de chaque service alimente l’ordre du jour et le chronomètre.</p>
            <ul className="divide-y divide-line rounded-xl border border-line">
              {[...meeting.participants.map((id) => allServices.find((s) => s.id === id)).filter((s) => !!s), ...allServices.filter((s) => s.active && !meeting.participants.includes(s.id))].map((s, i, arr) => {
                if (!s) return null
                const inMeeting = meeting.participants.includes(s.id)
                const pos = meeting.participants.indexOf(s.id)
                const move = (dir: -1 | 1) => {
                  const next = [...meeting.participants]
                  const target = pos + dir
                  if (target < 0 || target >= next.length) return
                  ;[next[pos], next[target]] = [next[target], next[pos]]
                  void updateMeeting(meeting.id, { participants: next })
                }
                return (
                  <li key={s.id} className={clsx('flex items-center gap-3 px-3 py-2.5', !inMeeting && 'bg-canvas/60')}>
                    <input
                      type="checkbox"
                      className="size-4 accent-novia-600"
                      checked={inMeeting}
                      aria-label={`${s.name} participe`}
                      onChange={(e) =>
                        updateMeeting(meeting.id, {
                          participants: e.target.checked ? [...meeting.participants, s.id] : meeting.participants.filter((id) => id !== s.id),
                        })
                      }
                    />
                    <span className={clsx('min-w-0 flex-1', !inMeeting && 'opacity-60')}>
                      <ServiceBadge service={s} size="sm" />
                    </span>
                    {inMeeting && (
                      <>
                        <Stepper label={`Durée ${s.shortName}`} value={meeting.durations[s.id] ?? s.durationMinutes} min={1} max={60} suffix="min" onChange={(v) => updateMeeting(meeting.id, { durations: { ...meeting.durations, [s.id]: v } })} />
                        <IconButton icon={ArrowUp} label="Monter" size="xs" disabled={pos === 0} onClick={() => move(-1)} />
                        <IconButton icon={ArrowDown} label="Descendre" size="xs" disabled={pos === meeting.participants.length - 1 || i === arr.length - 1} onClick={() => move(1)} />
                      </>
                    )}
                  </li>
                )
              })}
            </ul>
            <p className="mt-3 text-sm font-semibold text-ink">Durée totale : {planned} minutes</p>
          </section>
        </div>
      )}

      <NewMeetingDialog open={duplicate} onClose={() => setDuplicate(false)} sourceId={meeting.id} />
      <ReturnDialog
        open={!!returning}
        serviceName={returningService?.shortName ?? ''}
        onClose={() => setReturning(null)}
        onConfirm={(comment) => {
          if (returning) void setSubmissionStatus(meeting.id, returning, 'in_progress', comment)
          toast.success('Contenu renvoyé au responsable')
          setReturning(null)
        }}
      />
    </div>
  )
}
