import { clsx } from 'clsx'
import { GitBranch, Plus } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Select } from '@/components/ui/Form'
import { aiDb, useAiStore } from '../store'
import type { AgentId, AiMission, AiMissionEvent, MissionStatus, Priority } from '../types'
import { actorLabel, AgentAvatar, agentById, dateTime, Markdown, MISSION_STATUS, MissionStatusChip, PRIORITY, PriorityChip, timeAgo } from '../ui'

const COLUMNS: { key: string; label: string; statuses: MissionStatus[] }[] = [
  { key: 'todo', label: 'À faire', statuses: ['proposed', 'todo'] },
  { key: 'doing', label: 'En cours', statuses: ['in_progress'] },
  { key: 'validation', label: 'Validation humaine', statuses: ['waiting_validation'] },
  { key: 'blocked', label: 'Bloquées', statuses: ['blocked'] },
  { key: 'done', label: 'Terminées', statuses: ['done', 'cancelled'] },
]

const RANK: Record<Priority, number> = { critical: 0, high: 1, normal: 2, low: 3 }

function MissionCard({ mission, onOpen }: { mission: AiMission; onOpen: () => void }) {
  const agents = useAiStore((s) => s.agents)
  const missions = useAiStore((s) => s.missions)
  const owner = agentById(agents, mission.owner)
  const waiting = mission.depends_on.filter((d) => missions.find((m) => m.id === d)?.status !== 'done').length
  return (
    <button type="button" onClick={onOpen} className="w-full rounded-lg bg-white p-3 text-left ring-1 ring-line transition-shadow hover:shadow-float">
      <div className="flex items-start gap-2">
        <span className="min-w-0 flex-1 text-sm leading-snug font-semibold text-ink">{mission.title}</span>
        {mission.priority !== 'normal' && <PriorityChip priority={mission.priority} />}
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs text-ink-3">
        <AgentAvatar agent={owner} size={20} />
        <span className="truncate">{owner?.name ?? 'Non assignée'}</span>
        {waiting > 0 && (
          <span className="inline-flex items-center gap-0.5" title="Dépend de missions non terminées">
            <GitBranch size={12} /> {waiting}
          </span>
        )}
        <span className="ml-auto whitespace-nowrap">{timeAgo(mission.updated_at)}</span>
      </div>
    </button>
  )
}

export function MissionsBoard({ onOpen }: { onOpen: (id: string) => void }) {
  const missions = useAiStore((s) => s.missions)
  const agents = useAiStore((s) => s.agents)
  const [owner, setOwner] = useState('')
  const [creating, setCreating] = useState(false)
  const filtered = useMemo(() => missions.filter((m) => !owner || m.owner === owner), [missions, owner])

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select className="w-56" value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Filtrer par agent">
          <option value="">Tous les agents</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.title} — {a.name}
            </option>
          ))}
        </Select>
        <span className="text-sm text-ink-3">Les missions sans dépendance sont traitées en parallèle à chaque cycle.</span>
        <Button className="ml-auto" variant="primary" icon={Plus} onClick={() => setCreating(true)}>
          Nouvelle mission
        </Button>
      </div>
      <div className="overflow-x-auto pb-2 scrollbar-thin">
      <div className="grid min-w-[1180px] grid-cols-5 gap-3">
        {COLUMNS.map((col) => {
          const items = filtered
            .filter((m) => col.statuses.includes(m.status))
            .sort((a, b) => (col.key === 'done' ? b.updated_at.localeCompare(a.updated_at) : RANK[a.priority] - RANK[b.priority] || a.created_at.localeCompare(b.created_at)))
          const shown = col.key === 'done' ? items.slice(0, 15) : items
          return (
            <section key={col.key} className="rounded-xl bg-canvas p-2.5">
              <h3 className="mb-2 flex items-center gap-2 px-1 text-sm font-bold text-ink">
                <span className="size-2 rounded-full" style={{ background: MISSION_STATUS[col.statuses[0]].dot }} />
                {col.label}
                <span className="ml-auto text-xs font-semibold text-ink-3">{items.length}</span>
              </h3>
              <div className="space-y-2">
                {shown.map((m) => (
                  <MissionCard key={m.id} mission={m} onOpen={() => onOpen(m.id)} />
                ))}
                {items.length === 0 && <p className="px-1 py-3 text-xs text-ink-3">Aucune mission.</p>}
              </div>
            </section>
          )
        })}
      </div>
      </div>
      <NewMissionDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  )
}

export function NewMissionDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const agents = useAiStore((s) => s.agents)
  const [form, setForm] = useState({ title: '', description: '', owner: 'ceo' as AgentId, priority: 'normal' as Priority })
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (form.title.trim().length < 4) return toast.error('Donnez un titre à la mission.')
    setBusy(true)
    try {
      await aiDb.createMission({ ...form, title: form.title.trim(), description: form.description.trim() })
      toast.success('Mission créée : elle sera traitée au prochain cycle.')
      setForm({ title: '', description: '', owner: 'ceo', priority: 'normal' })
      onClose()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open={open} onClose={onClose} title="Nouvelle mission" description="Confiez directement un travail à un agent. Pour une demande large, passez plutôt par le CEO.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Titre">
          <input className="field" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Auditer les droits des comptes responsables" />
        </Field>
        <Field label="Description et critères d’acceptation">
          <textarea className="field min-h-28" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Responsable">
            <Select value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value as AgentId })}>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title} — {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Priorité">
            <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })}>
              {(Object.keys(PRIORITY) as Priority[]).map((p) => (
                <option key={p} value={p}>
                  {PRIORITY[p].label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button type="submit" variant="primary" icon={Plus} loading={busy}>Créer la mission</Button>
        </div>
      </form>
    </Dialog>
  )
}

const EVENT_LABELS: Record<string, string> = {
  created: 'Création',
  started: 'Prise en charge',
  update: 'Mise à jour',
  note: 'Note',
  done: 'Terminée',
  paused: 'En pause',
  validation_requested: 'Validation demandée',
  approved: 'Validée',
  rejected: 'Refusée',
}

export function MissionDialog({ id, onClose, onOpenAgent }: { id: string | null; onClose: () => void; onOpenAgent: (id: string) => void }) {
  const missions = useAiStore((s) => s.missions)
  const agents = useAiStore((s) => s.agents)
  const loadEvents = useAiStore((s) => s.missionEvents)
  const mission = missions.find((m) => m.id === id)
  const [events, setEvents] = useState<AiMissionEvent[]>([])
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!id) return
    let alive = true
    void loadEvents(id).then((e) => alive && setEvents(e))
    return () => {
      alive = false
    }
  }, [id, loadEvents, mission?.updated_at])

  if (!mission) return null
  const owner = agentById(agents, mission.owner)
  const deps = missions.filter((m) => mission.depends_on.includes(m.id))
  const children = missions.filter((m) => m.parent_id === mission.id)
  const parent = missions.find((m) => m.id === mission.parent_id)

  const update = async (patch: Partial<AiMission>, label: string) => {
    try {
      await aiDb.updateMission(mission.id, patch, label)
      toast.success('Mission mise à jour.')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <Dialog open onClose={onClose} size="xl" title={mission.title} description={`Créée par ${actorLabel(agents, mission.created_by)} · ${dateTime(mission.created_at)}`}>
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <MissionStatusChip status={mission.status} />
            <PriorityChip priority={mission.priority} />
            {mission.attempts > 0 && <span className="text-xs text-ink-3">{mission.attempts} passage(s)</span>}
            {owner && (
              <button type="button" onClick={() => onOpenAgent(owner.id)} className="ml-auto inline-flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-semibold text-ink hover:bg-canvas">
                <AgentAvatar agent={owner} size={24} /> {owner.name} · {owner.title}
              </button>
            )}
          </div>
          {mission.description && (
            <section>
              <h3 className="mb-1 text-sm font-bold text-ink">Description</h3>
              <Markdown text={mission.description} />
            </section>
          )}
          <section>
            <h3 className="mb-1 text-sm font-bold text-ink">Résultat</h3>
            {mission.result ? <Markdown text={mission.result} className="rounded-xl bg-canvas p-4" /> : <p className="text-sm text-ink-3">Pas encore de résultat.</p>}
          </section>
          {(deps.length > 0 || children.length > 0 || parent) && (
            <section className="space-y-1 text-sm">
              {parent && <p className="text-ink-2">Mission parente : <strong>{parent.title}</strong></p>}
              {deps.length > 0 && <p className="text-ink-2">Dépend de : {deps.map((d) => `${d.title} (${MISSION_STATUS[d.status].label.toLowerCase()})`).join(' · ')}</p>}
              {children.length > 0 && <p className="text-ink-2">Sous-missions : {children.map((d) => `${d.title} (${MISSION_STATUS[d.status].label.toLowerCase()})`).join(' · ')}</p>}
            </section>
          )}
        </div>
        <div className="space-y-5">
          <section className="space-y-3 rounded-xl bg-canvas p-4">
            <h3 className="text-sm font-bold text-ink">Pilotage</h3>
            <div className="grid grid-cols-2 gap-2">
              <Select className="field-sm" value={mission.status} onChange={(e) => update({ status: e.target.value as MissionStatus, ...(e.target.value === 'todo' ? { attempts: 0 } : {}) }, `Statut → ${MISSION_STATUS[e.target.value as MissionStatus].label}`)} aria-label="Statut">
                {(Object.keys(MISSION_STATUS) as MissionStatus[]).map((s) => (
                  <option key={s} value={s}>{MISSION_STATUS[s].label}</option>
                ))}
              </Select>
              <Select className="field-sm" value={mission.priority} onChange={(e) => update({ priority: e.target.value as Priority }, `Priorité → ${PRIORITY[e.target.value as Priority].label}`)} aria-label="Priorité">
                {(Object.keys(PRIORITY) as Priority[]).map((p) => (
                  <option key={p} value={p}>{PRIORITY[p].label}</option>
                ))}
              </Select>
              <Select className="field-sm col-span-2" value={mission.owner ?? ''} onChange={(e) => update({ owner: e.target.value as AgentId }, `Réassignée à ${e.target.value}`)} aria-label="Responsable">
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.title} — {a.name}</option>
                ))}
              </Select>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault()
                if (!note.trim()) return
                await aiDb.addNote(mission.id, note.trim())
                setNote('')
                setEvents(await loadEvents(mission.id))
              }}
              className="flex gap-2"
            >
              <input className="field field-sm" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ajouter une consigne ou une note…" />
              <Button type="submit" size="sm" variant="secondary">Ajouter</Button>
            </form>
          </section>
          <section>
            <h3 className="mb-2 text-sm font-bold text-ink">Historique</h3>
            <ol className="relative space-y-3 border-l border-line pl-4">
              {events.map((ev) => (
                <li key={ev.id} className="text-sm">
                  <span className={clsx('absolute -left-[5px] mt-1.5 size-2.5 rounded-full', ev.actor === 'human' ? 'bg-ink' : 'bg-novia-400')} />
                  <div className="text-xs text-ink-3">
                    {dateTime(ev.created_at)} · {actorLabel(agents, ev.actor)} · {EVENT_LABELS[ev.kind] ?? ev.kind}
                  </div>
                  {ev.content && <div className="mt-0.5 whitespace-pre-wrap text-ink-2">{ev.content.length > 600 ? `${ev.content.slice(0, 600)}…` : ev.content}</div>}
                </li>
              ))}
              {events.length === 0 && <li className="text-sm text-ink-3">Aucun événement.</li>}
            </ol>
          </section>
        </div>
      </div>
    </Dialog>
  )
}
