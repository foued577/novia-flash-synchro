import { clsx } from 'clsx'
import { CalendarPlus, Copy, FileText, History, MoreHorizontal, Presentation, Search, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { runExport } from '@/components/meeting/ExportMenu'
import { NewMeetingDialog } from '@/components/meeting/NewMeetingDialog'
import { MeetingStatusBadge } from '@/components/ui/Badges'
import { Button, IconButton } from '@/components/ui/Button'
import { confirmAction } from '@/components/ui/Dialog'
import { Segmented, Select } from '@/components/ui/Form'
import { Menu } from '@/components/ui/Menu'
import { EmptyState, PageHeader } from '@/components/ui/Misc'
import { plannedMinutes } from '@/domain/deck'
import { computePeriods } from '@/domain/periods'
import { isAdmin } from '@/domain/permissions'
import type { MeetingStatus } from '@/domain/types'
import { formatDuration, formatFullDate, formatPeriodShort, formatTime } from '@/lib/format'
import { useServices, useSortedMeetings } from '@/store/hooks'
import { useAppStore } from '@/store/useAppStore'

type Filter = 'all' | 'upcoming' | 'done'

export function HistoryPage() {
  const user = useAppStore((s) => s.user)!
  const deleteMeeting = useAppStore((s) => s.deleteMeeting)
  const meetings = useSortedMeetings()
  const services = useServices()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [year, setYear] = useState('all')
  const [filter, setFilter] = useState<Filter>('all')
  const [dialog, setDialog] = useState<{ open: boolean; source: string | null }>({ open: false, source: null })
  const admin = isAdmin(user)

  useEffect(() => {
    if (params.get('nouvelle') === '1' && admin) {
      setDialog({ open: true, source: null })
      setParams({}, { replace: true })
    }
  }, [params, setParams, admin])

  const years = useMemo(() => [...new Set(meetings.map((m) => m.isoYear))].sort((a, b) => b - a), [meetings])
  const filtered = meetings.filter((m) => {
    if (year !== 'all' && m.isoYear !== Number(year)) return false
    const doneStatuses: MeetingStatus[] = ['held', 'archived']
    if (filter === 'done' && !doneStatuses.includes(m.status)) return false
    if (filter === 'upcoming' && doneStatuses.includes(m.status)) return false
    if (query.trim()) {
      const q = query.trim().toLowerCase().replace(/^s(emaine)?\s*/, '')
      const haystack = `${m.isoWeek} ${m.title ?? ''} ${m.notes} ${formatPeriodShort(m.weekStart, m.weekEnd)}`.toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  })

  const remove = async (id: string, week: number) => {
    const ok = await confirmAction({ title: 'Supprimer cette réunion ?', message: `La Flash Synchro de la semaine ${week} sera définitivement supprimée.`, confirmLabel: 'Supprimer', danger: true })
    if (!ok) return
    await deleteMeeting(id)
    toast.success('Réunion supprimée')
  }

  return (
    <div>
      <PageHeader
        title="Historique des Flash Synchro"
        description="Toutes les réunions sont archivées avec leur présentation : consultez-les, exportez-les ou dupliquez-les pour gagner du temps."
        actions={
          admin && (
            <Button variant="primary" icon={CalendarPlus} onClick={() => setDialog({ open: true, source: null })}>
              Nouvelle réunion
            </Button>
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="relative min-w-60 flex-1 sm:max-w-sm">
          <Search size={17} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
          <input className="field pl-9" placeholder="Rechercher une semaine (ex. 46)" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Rechercher" />
        </label>
        <Select className="w-auto" value={year} onChange={(e) => setYear(e.target.value)} aria-label="Année">
          <option value="all">Toutes les années</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </Select>
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'Toutes' },
            { value: 'upcoming', label: 'À venir' },
            { value: 'done', label: 'Tenues et archivées' },
          ]}
        />
      </div>

      <section className="panel overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState icon={History} title="Aucune réunion ne correspond">
            Modifiez la recherche ou les filtres.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-[15px]">
              <thead>
                <tr className="border-b border-line bg-canvas/60 text-left text-[13px] font-semibold text-ink-3">
                  <th className="px-5 py-2.5">Semaine</th>
                  <th className="px-3 py-2.5">Période des réalisations</th>
                  <th className="px-3 py-2.5">Réunion</th>
                  <th className="px-3 py-2.5">Services</th>
                  <th className="px-3 py-2.5">Statut</th>
                  <th className="px-3 py-2.5">Durée</th>
                  <th className="px-5 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filtered.map((m) => {
                  const p = computePeriods(m)
                  const planned = plannedMinutes(m)
                  const over = m.timing ? m.timing.totalSeconds > planned * 60 : false
                  return (
                    <tr key={m.id} className="hover:bg-canvas/40">
                      <td className="px-5 py-3">
                        <Link to={`/reunions/${m.id}`} className="flex items-center gap-3">
                          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-novia-50 font-display text-[15px] font-bold text-novia-700">S{m.isoWeek}</span>
                          <span>
                            <span className="block font-semibold text-ink hover:underline">Semaine {m.isoWeek}</span>
                            <span className="block text-sm text-ink-3">
                              {formatPeriodShort(m.weekStart, m.weekEnd)} {m.isoYear}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-ink-2">
                        <span className="block font-semibold text-ink">{p.review.label}</span>
                        <span className="text-sm">{p.review.rangeShort}</span>
                      </td>
                      <td className="px-3 py-3 text-ink-2">
                        {formatFullDate(m.meetingDate, false)}
                        <span className="block text-sm text-ink-3">{formatTime(m.meetingTime)}</span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex -space-x-1">
                          {m.participants.map((id) => {
                            const s = services.find((x) => x.id === id)
                            return s ? <span key={id} title={s.name} className="size-5 rounded-full ring-2 ring-white" style={{ background: s.palette.accent }} /> : null
                          })}
                        </div>
                        <span className="mt-1 block text-xs text-ink-3">{m.participants.length} services</span>
                      </td>
                      <td className="px-3 py-3">
                        <MeetingStatusBadge status={m.status} />
                      </td>
                      <td className="px-3 py-3 text-sm">
                        {m.timing ? (
                          <span className={clsx('font-semibold', over ? 'text-amber-700' : 'text-ink')}>{formatDuration(m.timing.totalSeconds)}</span>
                        ) : (
                          <span className="text-ink-3">{planned} min prévues</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="ghost" icon={Presentation} onClick={() => navigate(`/reunions/${m.id}/presentation`)}>
                            Consulter
                          </Button>
                          <Menu
                            items={[
                              { label: 'Ouvrir la réunion', icon: FileText, onSelect: () => navigate(`/reunions/${m.id}`) },
                              ...(admin ? [{ label: 'Dupliquer vers une autre semaine', icon: Copy, onSelect: () => setDialog({ open: true, source: m.id }) }] : []),
                              { label: 'Exporter en PDF', icon: FileText, onSelect: () => void runExport(m.id, 'pdf') },
                              { label: 'Exporter en PowerPoint', icon: Presentation, onSelect: () => void runExport(m.id, 'pptx') },
                              ...(admin ? (['separator', { label: 'Supprimer', icon: Trash2, danger: true, onSelect: () => void remove(m.id, m.isoWeek) }] as const) : []),
                            ]}
                            trigger={(props) => <IconButton {...props} icon={MoreHorizontal} label={`Actions pour la semaine ${m.isoWeek}`} />}
                          />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <NewMeetingDialog open={dialog.open} sourceId={dialog.source} onClose={() => setDialog({ open: false, source: null })} />
    </div>
  )
}
