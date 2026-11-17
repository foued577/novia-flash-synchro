import { clsx } from 'clsx'
import { ChevronLeft, ChevronRight, Copy, LayoutTemplate } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { dateInWeek, shiftWeek, weekInfo, type WeekInfo } from '@/domain/isoWeek'
import { computePeriods } from '@/domain/periods'
import { findMeetingForWeek, sortMeetingsDesc, targetMeetingWeek } from '@/domain/selectors'
import { formatPeriod, formatPeriodShort } from '@/lib/format'
import { useAppStore } from '@/store/useAppStore'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { Field, Segmented, Select } from '../ui/Form'

interface Props {
  open: boolean
  onClose: () => void
  /** Réunion à dupliquer (pré-sélectionnée). */
  sourceId?: string | null
}

export function NewMeetingDialog({ open, onClose, sourceId }: Props) {
  const snapshot = useAppStore((s) => s.snapshot)!
  const today = useAppStore((s) => s.today)
  const nowTime = useAppStore((s) => s.nowTime)
  const createMeeting = useAppStore((s) => s.createMeeting)
  const navigate = useNavigate()
  const meetings = useMemo(() => sortMeetingsDesc(snapshot.meetings), [snapshot.meetings])

  /** Première semaine libre à partir de la semaine de la prochaine réunion. */
  const defaultWeek = useMemo(() => {
    let w: WeekInfo = targetMeetingWeek(snapshot.settings, today, nowTime)
    for (let i = 0; i < 60 && findMeetingForWeek(meetings, w); i++) w = shiftWeek(w, 1)
    return w
  }, [snapshot.settings, today, nowTime, meetings])

  const [week, setWeek] = useState<WeekInfo>(defaultWeek)
  const [reviewWeeks, setReviewWeeks] = useState('1')
  const [date, setDate] = useState(dateInWeek(defaultWeek, snapshot.settings.meetingWeekday))
  const [time, setTime] = useState(snapshot.settings.meetingTime)
  const [mode, setMode] = useState<'duplicate' | 'template'>(meetings.length ? 'duplicate' : 'template')
  const [source, setSource] = useState<string>(sourceId ?? meetings[0]?.id ?? '')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setWeek(defaultWeek)
    setDate(dateInWeek(defaultWeek, snapshot.settings.meetingWeekday))
    setTime(snapshot.settings.meetingTime)
    setReviewWeeks('1')
    setMode(sourceId || meetings.length ? 'duplicate' : 'template')
    setSource(sourceId ?? meetings[0]?.id ?? '')
  }, [open, defaultWeek, sourceId, meetings, snapshot.settings])

  const moveWeek = (n: number) => {
    const next = shiftWeek(week, n)
    setWeek(next)
    setDate(dateInWeek(next, snapshot.settings.meetingWeekday))
  }

  const exists = findMeetingForWeek(meetings, week)
  const periods = computePeriods({ isoYear: week.year, isoWeek: week.week, reviewWeeks: Number(reviewWeeks), forecastReference: snapshot.settings.forecastReference })
  const dateOutside = date < week.start || date > week.end

  const submit = async () => {
    setBusy(true)
    try {
      const id = await createMeeting({ week, reviewWeeks: Number(reviewWeeks), meetingDate: date, meetingTime: time, sourceId: mode === 'duplicate' ? source || null : null })
      toast.success(`Flash Synchro de la semaine ${week.week} créée`)
      onClose()
      navigate(`/reunions/${id}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Création impossible')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={sourceId ? 'Dupliquer une Flash Synchro' : 'Nouvelle Flash Synchro'}
      description="Les dates, le numéro de semaine et les périodes S-1 / S+1 sont calculés automatiquement (calendrier ISO)."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="primary" onClick={submit} loading={busy} disabled={!!exists || (mode === 'duplicate' && !source)}>
            Créer la réunion
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <div>
          <span className="label">Semaine de la réunion</span>
          <div className="flex items-center gap-2 rounded-xl border border-line-strong p-2">
            <Button variant="ghost" size="sm" icon={ChevronLeft} onClick={() => moveWeek(-1)} aria-label="Semaine précédente" />
            <div className="min-w-0 flex-1 text-center">
              <div className="font-display text-lg font-bold">Semaine {week.week} — {week.year}</div>
              <div className="text-sm text-ink-2">{formatPeriod(week.start, week.end)}</div>
            </div>
            <Button variant="ghost" size="sm" icon={ChevronRight} onClick={() => moveWeek(1)} aria-label="Semaine suivante" />
          </div>
          {exists && <p className="mt-2 text-sm font-semibold text-red-700">Une Flash Synchro existe déjà pour cette semaine.</p>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date de la réunion" hint={dateOutside ? 'Attention : cette date est en dehors de la semaine choisie.' : undefined}>
            <input type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Heure de début">
            <input type="time" className="field" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>

        <div>
          <span className="label">Période des réalisations</span>
          <Segmented
            value={reviewWeeks}
            onChange={setReviewWeeks}
            options={[
              { value: '1', label: '1 semaine' },
              { value: '2', label: '2 semaines' },
              { value: '3', label: '3 semaines' },
            ]}
          />
          <p className="mt-2 text-sm text-ink-2">
            Réalisations : <strong className="font-semibold text-ink">{periods.review.label.toLowerCase()}</strong> ({periods.review.rangeShort}) — Prévisions {periods.forecast.code} :{' '}
            <strong className="font-semibold text-ink">{periods.forecast.label.toLowerCase()}</strong> ({formatPeriodShort(periods.forecast.start, periods.forecast.end)})
          </p>
        </div>

        <div>
          <span className="label">Contenu de départ</span>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                { key: 'duplicate', icon: Copy, title: 'Dupliquer une réunion', text: 'Reprend les diapositives et place les chiffres actuels en « rappel ».' },
                { key: 'template', icon: LayoutTemplate, title: 'Partir des modèles', text: 'Diapositives standard de chaque service, à remplir.' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setMode(opt.key)}
                disabled={opt.key === 'duplicate' && meetings.length === 0}
                className={clsx('rounded-xl border p-4 text-left transition-colors disabled:opacity-40', mode === opt.key ? 'border-novia-500 bg-novia-50/60 ring-2 ring-novia-100' : 'border-line hover:border-novia-300')}
              >
                <opt.icon size={20} className="text-novia-600" />
                <div className="mt-2 font-semibold">{opt.title}</div>
                <div className="text-sm text-ink-2">{opt.text}</div>
              </button>
            ))}
          </div>
          {mode === 'duplicate' && (
            <Field label="Réunion à dupliquer" className="mt-3">
              <Select value={source} onChange={(e) => setSource(e.target.value)}>
                {meetings.map((m) => (
                  <option key={m.id} value={m.id}>
                    Semaine {m.isoWeek} ({m.isoYear}) — {formatPeriod(weekInfo(m.isoYear, m.isoWeek).start, weekInfo(m.isoYear, m.isoWeek).end)}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
      </div>
    </Dialog>
  )
}
