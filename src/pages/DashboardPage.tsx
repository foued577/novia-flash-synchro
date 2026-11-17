import { ArrowDownRight, ArrowRight, ArrowUpRight, CalendarClock, ChevronRight, Hourglass, Mail, Play, Presentation, Timer } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Sparkline } from '@/components/dashboard/Sparkline'
import { TimeRibbon } from '@/components/brand/TimeRibbon'
import { kpiDelta } from '@/components/slides/BlockViews'
import { MeetingStatusBadge, StatusBadge } from '@/components/ui/Badges'
import { Button } from '@/components/ui/Button'
import { Avatar, EmptyState, ProgressRing, SectionTitle, ServiceBadge } from '@/components/ui/Misc'
import { participatingServices, plannedMinutes } from '@/domain/deck'
import { computePeriods, meetingTitle } from '@/domain/periods'
import { isAdmin } from '@/domain/permissions'
import { completion, kpiHistory, serviceFill, submissionDeadline, submissionStatus } from '@/domain/selectors'
import { SUBMISSION_ORDER } from '@/domain/status'
import type { KpiItem, MeetingBundle, Service } from '@/domain/types'
import { formatDuration, formatFullDate, formatFullDateCap, formatPeriodShort, formatRelativeDay, formatTime, parseNumber } from '@/lib/format'
import { useBundle, useCurrentMeeting, useServices, useSortedMeetings } from '@/store/hooks'
import { useAppStore } from '@/store/useAppStore'

function greeting(time: string) {
  const h = Number(time.slice(0, 2))
  return h >= 18 ? 'Bonsoir' : 'Bonjour'
}

/** Indicateur phare d'un service : premier indicateur des réalisations, sinon de l'état global. */
function keyKpi(bundle: MeetingBundle | undefined, serviceId: string): KpiItem | null {
  if (!bundle) return null
  const slides = bundle.slides.filter((s) => s.serviceId === serviceId && !s.hidden)
  for (const kind of ['achievements', 'overview'] as const) {
    for (const slide of slides.filter((s) => s.kind === kind).sort((a, b) => a.position - b.position)) {
      for (const block of slide.blocks) {
        if (block.type === 'kpis') {
          const item = block.items.find((i) => i.value.trim() && parseNumber(i.value) !== null)
          if (item) return item
        }
      }
    }
  }
  return null
}

function KpiTile({ service, item, history }: { service: Service; item: KpiItem; history: number[] }) {
  const d = kpiDelta(item)
  const Arrow = !d || d.delta === 0 ? ArrowRight : d.delta > 0 ? ArrowUpRight : ArrowDownRight
  const color = !d ? '#5C6880' : d.tone === 'good' ? '#15803D' : d.tone === 'bad' ? '#B42318' : '#5C6880'
  return (
    <div className="flex flex-col gap-2.5 border-t border-l border-line p-4 sm:p-5">
      <div className="flex items-center gap-2 text-sm">
        <span className="size-2.5 rounded-sm" style={{ background: service.palette.accent }} aria-hidden />
        <span className="font-semibold text-ink-2">{service.shortName}</span>
      </div>
      <div className="text-[15px] text-ink-2">{item.label}</div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-display text-[32px] leading-none font-bold text-ink">
            {item.value}
            {item.unit && <span className="ml-1 text-base font-semibold text-ink-2">{item.unit}</span>}
          </div>
          {d && (
            <div className="mt-2 inline-flex items-center gap-1 text-sm font-semibold" style={{ color }}>
              <Arrow size={16} aria-hidden />
              {d.label}
              <span className="font-normal text-ink-3">vs S-1</span>
            </div>
          )}
        </div>
        <Sparkline values={history} accent={service.palette.accent} />
      </div>
    </div>
  )
}

export function DashboardPage() {
  const user = useAppStore((s) => s.user)!
  const snapshot = useAppStore((s) => s.snapshot)!
  const today = useAppStore((s) => s.today)
  const nowTime = useAppStore((s) => s.nowTime)
  const bundles = useAppStore((s) => s.bundles)
  const ensureBundles = useAppStore((s) => s.ensureBundles)
  const meeting = useCurrentMeeting()
  const bundle = useBundle(meeting?.id)
  const meetings = useSortedMeetings()
  const allServices = useServices()
  const navigate = useNavigate()

  const recent = useMemo(() => meetings.filter((m) => m.id !== meeting?.id && m.meetingDate <= (meeting?.meetingDate ?? '9999')).slice(0, 7), [meetings, meeting])
  useEffect(() => {
    void ensureBundles(recent.map((m) => m.id))
  }, [recent, ensureBundles])

  if (!meeting) {
    return (
      <div className="panel">
        <EmptyState icon={CalendarClock} title="Aucune réunion pour le moment" action={isAdmin(user) ? <Button variant="primary" onClick={() => navigate('/historique?nouvelle=1')}>Créer une réunion</Button> : undefined}>
          La réunion de la semaine apparaîtra ici dès sa création.
        </EmptyState>
      </div>
    )
  }

  const services = participatingServices(meeting, allServices)
  const comp = completion(bundle, meeting.participants)
  const periods = computePeriods(meeting)
  const deadline = submissionDeadline(meeting, snapshot.settings)
  const statuses = Object.fromEntries(services.map((s) => [s.id, submissionStatus(bundle, s.id)]))
  const pending = services.filter((s) => comp.pending.includes(s.id))
  const myService = services.find((s) => s.id === user.serviceId)
  const managerOf = (s: Service) => snapshot.users.find((u) => u.id === s.managerId)
  const historyBundles = [...recent].reverse().map((m) => bundles[m.id]).filter((b): b is MeetingBundle => !!b)

  const launch = () => {
    void document.documentElement.requestFullscreen?.().catch(() => undefined)
    navigate(`/reunions/${meeting.id}/presentation`)
  }

  const reminder = () => {
    const emails = pending.map((s) => managerOf(s)?.email).filter(Boolean).join(',')
    const subject = `Flash Synchro semaine ${meeting.isoWeek} — informations à transmettre`
    const body = `Bonjour,\n\nPour préparer la Flash Synchro du ${formatFullDate(meeting.meetingDate)} à ${formatTime(meeting.meetingTime)}, merci de compléter et de soumettre les informations de votre service avant le ${formatFullDate(deadline.date, false)}, ${formatTime(deadline.time)}.\n\nMerci,\n${user.fullName}`
    window.location.href = `mailto:${emails}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  }

  const durationData = [...recent]
    .reverse()
    .filter((m) => m.timing)
    .map((m) => ({ name: `S${m.isoWeek}`, minutes: Math.round(((m.timing?.totalSeconds ?? 0) / 60) * 10) / 10, planned: plannedMinutes(m) }))
  const planned = plannedMinutes(meeting)
  const durationMax = Math.max(planned, ...durationData.map((d) => d.minutes))
  const durationTicks = Array.from({ length: Math.ceil(durationMax / 10) + 1 }, (_, i) => i * 10)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-[28px]">
          {greeting(nowTime)} {user.fullName.split(' ')[0]}
        </h1>
        <p className="mt-1 text-ink-2">
          {comp.done === comp.total ? 'Tous les services ont transmis leurs informations.' : comp.total - comp.done > 1 ? `${comp.total - comp.done} services doivent encore transmettre leurs informations.` : '1 service doit encore transmettre ses informations.'}
        </p>
      </div>

      {myService && (
        <div className="panel grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4 p-4 sm:flex sm:p-5" style={{ background: myService.palette.tint, borderColor: myService.palette.soft }}>
          <ServiceBadge service={myService} size="lg" showName={false} />
          <div className="min-w-0 sm:flex-1">
            <div className="font-display text-lg font-bold">Votre espace : {myService.name}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-ink-2">
              <StatusBadge status={statuses[myService.id]} size="sm" />
              <span>
                {serviceFill(bundle, myService.id).filled} diapositive(s) renseignée(s) sur {serviceFill(bundle, myService.id).total} — à transmettre avant le {formatFullDate(deadline.date, false)}, {formatTime(deadline.time)}
              </span>
            </div>
          </div>
          <Button variant="primary" iconRight={ChevronRight} className="col-span-2 sm:col-span-1" onClick={() => navigate(`/reunions/${meeting.id}/services/${myService.id}`)}>
            Ouvrir mon espace
          </Button>
        </div>
      )}

      {/* Prochaine réunion — le ruban du temps est le cœur de la page */}
      <section className="panel overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-6 p-5 sm:p-7">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-novia-600">Prochaine réunion</span>
              <MeetingStatusBadge status={meeting.status} />
            </div>
            <h2 className="mt-2 text-xl leading-snug font-bold sm:text-2xl">{meetingTitle(meeting)}</h2>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-[15px] text-ink-2">
              <span className="inline-flex items-center gap-2">
                <CalendarClock size={18} className="text-novia-600" />
                <span>
                  <strong className="font-semibold text-ink">{formatFullDateCap(meeting.meetingDate)}</strong> à {formatTime(meeting.meetingTime)} — {formatRelativeDay(meeting.meetingDate, today)}
                </span>
              </span>
              <span className="inline-flex items-center gap-2">
                <Hourglass size={18} className="text-novia-600" />
                Saisie jusqu’au {formatFullDate(deadline.date, false)}, {formatTime(deadline.time)}
              </span>
            </div>
            <div className="mt-2 text-[15px] text-ink-2">
              Réalisations {periods.review.code} : {periods.review.label.toLowerCase()} ({periods.review.rangeShort}) — Prévisions {periods.forecast.code} : {periods.forecast.label.toLowerCase()} ({periods.forecast.rangeShort})
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="lg" onClick={() => navigate(`/reunions/${meeting.id}`)}>
              Ouvrir la réunion
            </Button>
            <Button variant="primary" size="lg" icon={Play} onClick={launch}>
              Lancer la présentation
            </Button>
          </div>
        </div>
        <div className="border-t border-line bg-canvas/50 px-5 pt-4 pb-3 sm:px-7">
          <div className="mb-2.5 flex items-center justify-between text-sm">
            <span className="font-semibold text-ink-2">Déroulé et état de préparation</span>
            <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
              <Timer size={16} className="text-novia-600" /> {planned} minutes
            </span>
          </div>
          <div className="hidden sm:block">
            <TimeRibbon services={services} durations={meeting.durations} startTime={meeting.meetingTime} statuses={statuses} height={34} onSelect={(id) => navigate(`/reunions/${meeting.id}/services/${id}`)} />
          </div>
          <ul className="space-y-1.5 sm:hidden">
            {services.map((s) => (
              <li key={s.id}>
                <Link to={`/reunions/${meeting.id}/services/${s.id}`} className="flex items-center gap-3 rounded-lg bg-white px-3 py-2 ring-1 ring-line">
                  <span className="h-6 w-1.5 shrink-0 rounded-full" style={{ background: s.palette.accent }} aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{s.shortName}</span>
                  <span className="text-sm text-ink-2 tnum">{meeting.durations[s.id] ?? s.durationMinutes} min</span>
                  <StatusBadge status={statuses[s.id]} size="sm" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,8fr)]">
        {/* Complétion */}
        <section className="panel p-5 sm:p-6">
          <SectionTitle>Taux de complétion</SectionTitle>
          <div className="flex flex-wrap items-center gap-6">
            <ProgressRing value={comp.rate} size={132} stroke={13} color="#3661B3">
              <div className="text-center">
                <div className="font-display text-3xl font-bold text-ink">{Math.round(comp.rate * 100)} %</div>
                <div className="text-xs font-semibold text-ink-3">transmis</div>
              </div>
            </ProgressRing>
            <ul className="min-w-[180px] flex-1 space-y-2">
              {SUBMISSION_ORDER.slice()
                .reverse()
                .map((st) => (
                  <li key={st} className="flex items-center justify-between gap-3">
                    <StatusBadge status={st} size="sm" />
                    <span className="font-display text-lg font-bold tnum">{comp.counts[st]}</span>
                  </li>
                ))}
            </ul>
          </div>
          <div className="mt-6 border-t border-line pt-4">
            <div className="mb-2 text-sm font-semibold text-ink-2">Pas encore soumis</div>
            {pending.length === 0 ? (
              <p className="text-sm text-emerald-700">Tous les services ont soumis leurs informations.</p>
            ) : (
              <ul className="space-y-2">
                {pending.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3">
                    <Link to={`/reunions/${meeting.id}/services/${s.id}`} className="min-w-0 hover:underline">
                      <ServiceBadge service={s} size="sm" />
                    </Link>
                    <StatusBadge status={statuses[s.id]} size="sm" />
                  </li>
                ))}
              </ul>
            )}
            {pending.length > 0 && isAdmin(user) && (
              <Button variant="subtle" size="sm" icon={Mail} className="mt-4" onClick={reminder}>
                Relancer par e-mail
              </Button>
            )}
          </div>
        </section>

        {/* Services */}
        <section className="panel">
          <div className="px-5 pt-5 sm:px-6">
            <SectionTitle>Services</SectionTitle>
          </div>
          <ul className="divide-y divide-line">
            {services.map((s) => {
              const fill = serviceFill(bundle, s.id)
              const manager = managerOf(s)
              return (
                <li key={s.id}>
                  <Link to={`/reunions/${meeting.id}/services/${s.id}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-5 py-3.5 transition-colors hover:bg-canvas/60 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_120px_110px_20px] sm:px-6">
                    <ServiceBadge service={s} />
                    <span className="hidden min-w-0 items-center gap-2 text-sm text-ink-2 sm:flex">
                      {manager && <Avatar name={manager.fullName} color={s.palette.accent} size={24} />}
                      <span className="truncate">{manager?.fullName ?? 'Responsable à désigner'}</span>
                    </span>
                    <span className="justify-self-end sm:justify-self-start">
                      <StatusBadge status={statuses[s.id]} size="sm" />
                    </span>
                    <span className="col-span-2 flex items-center gap-2 sm:col-span-1" title={`${fill.filled} diapositive(s) renseignée(s) sur ${fill.total}`}>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                        <span className="block h-full rounded-full" style={{ width: `${fill.total ? (fill.filled / fill.total) * 100 : 0}%`, background: s.palette.accent }} />
                      </span>
                      <span className="text-xs font-semibold text-ink-3 tnum">
                        {fill.filled}/{fill.total}
                      </span>
                    </span>
                    <ChevronRight size={18} className="hidden text-ink-3 sm:block" />
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      </div>

      {/* Indicateurs clés : un indicateur phare par service */}
      <section className="panel">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-5 sm:px-6">
          <SectionTitle>Indicateurs clés de la semaine</SectionTitle>
          <span className="mb-3 text-sm text-ink-3">Tendance sur les dernières réunions</span>
        </div>
        <div className="mt-1 overflow-hidden rounded-b-[var(--radius-panel)]">
          <div className="-mt-px -ml-px grid sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
            {services.map((s) => {
              const item = keyKpi(bundle, s.id)
              if (!item) return null
              const history = [...kpiHistory(historyBundles, s.id, item.label).map((h) => parseNumber(h.value) ?? 0), parseNumber(item.value) ?? 0]
              return <KpiTile key={s.id} service={s} item={item} history={history} />
            })}
          </div>
        </div>
      </section>

      {/* Dernières réunions */}
      <section className="panel p-5 sm:p-6">
        <SectionTitle
          action={
            <Link to="/historique" className="text-sm font-semibold text-novia-600 hover:underline">
              Tout l’historique
            </Link>
          }
        >
          Dernières réunions
        </SectionTitle>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <ul className="divide-y divide-line">
            {recent.slice(0, 5).map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-2.5">
                <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-novia-50 font-display text-[15px] font-bold text-novia-700">S{m.isoWeek}</div>
                <div className="min-w-0 flex-1">
                  <Link to={`/reunions/${m.id}`} className="block truncate font-semibold text-ink hover:underline">
                    Semaine {m.isoWeek} — {formatPeriodShort(m.weekStart, m.weekEnd)} {m.isoYear}
                  </Link>
                  <div className="truncate text-sm text-ink-3">
                    {m.timing ? `Durée réelle ${formatDuration(m.timing.totalSeconds)}` : formatFullDate(m.meetingDate, false)}
                    {m.reviewWeeks > 1 ? ` — bilan sur ${m.reviewWeeks} semaines` : ''}
                  </div>
                </div>
                <Button variant="ghost" size="sm" icon={Presentation} onClick={() => navigate(`/reunions/${m.id}/presentation`)} aria-label={`Consulter la présentation de la semaine ${m.isoWeek}`}>
                  <span className="max-sm:hidden">Consulter</span>
                </Button>
              </li>
            ))}
            {recent.length === 0 && <li className="py-2 text-sm text-ink-3">Les réunions passées apparaîtront ici.</li>}
          </ul>
          {durationData.length > 1 && (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-ink-2">Durée réelle des réunions (minutes)</div>
                <div className="flex items-center gap-4 text-xs text-ink-2">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2.5 rounded-sm bg-novia-600" /> Dans les temps
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2.5 rounded-sm bg-[#D97706]" /> Dépassement
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-0.5 w-4 bg-ink-3" /> Prévu : {planned} min
                  </span>
                </div>
              </div>
              <div className="mt-3 h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={durationData} margin={{ top: 18, right: 4, left: -18, bottom: 0 }}>
                    <CartesianGrid stroke="#E6EAF1" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#5C6880' }} tickLine={false} stroke="#C3CBD8" />
                    <YAxis tick={{ fontSize: 12, fill: '#5C6880' }} tickLine={false} axisLine={false} allowDecimals={false} ticks={durationTicks} domain={[0, durationTicks[durationTicks.length - 1]]} />
                    <Tooltip cursor={{ fill: 'rgba(54,97,179,0.06)' }} formatter={(v) => [`${String(v).replace('.', ',')} min`, 'Durée réelle']} />
                    <ReferenceLine y={planned} stroke="#77839A" strokeWidth={1.5} />
                    <Bar dataKey="minutes" radius={[4, 4, 0, 0]} maxBarSize={24}>
                      {durationData.map((d) => (
                        <Cell key={d.name} fill={d.minutes > d.planned ? '#D97706' : '#3661B3'} />
                      ))}
                      <LabelList dataKey="minutes" position="top" style={{ fontSize: 12, fill: '#2B3445', fontWeight: 600 }} formatter={(v: unknown) => String(Math.round(Number(v)))} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
