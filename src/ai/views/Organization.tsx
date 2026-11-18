import { clsx } from 'clsx'
import { Brain, Target, Wrench } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Switch } from '@/components/ui/Form'
import { agentMetrics } from '../metrics'
import { aiDb, useAiStore } from '../store'
import type { AiAgent } from '../types'
import { AgentAvatar, MissionStatusChip, PriorityChip, TOOL_LABELS, timeAgo, formatTokens } from '../ui'

function AgentCard({ agent, onOpen }: { agent: AiAgent; onOpen: () => void }) {
  const missions = useAiStore((s) => s.missions)
  const current = missions.find((m) => m.id === agent.current_mission)
  const open = missions.filter((m) => m.owner === agent.id && ['todo', 'in_progress', 'waiting_validation', 'blocked'].includes(m.status)).length
  return (
    <button
      type="button"
      onClick={onOpen}
      className={clsx(
        'group relative min-h-[136px] w-full rounded-xl bg-white p-4 text-left ring-1 transition-shadow hover:shadow-float focus-visible:outline-2 focus-visible:outline-novia-500',
        agent.status === 'working' ? 'ring-emerald-300' : 'ring-line',
        !agent.enabled && 'opacity-60',
      )}
    >
      <span className="absolute inset-x-0 top-0 h-1 rounded-t-xl" style={{ background: agent.color }} />
      <div className="flex items-center gap-3">
        <AgentAvatar agent={agent} size={44} ring />
        <div className="min-w-0">
          <div className="font-display text-[15px] font-bold text-ink">{agent.title}</div>
          <div className="text-sm text-ink-3">{agent.name}</div>
        </div>
      </div>
      <div className="mt-3 min-h-[2.5rem] text-[13px] leading-snug text-ink-2">
        {agent.status === 'working' ? (
          <span className="font-semibold text-emerald-700">Travaille sur : {current?.title ?? 'ses messages'}</span>
        ) : !agent.enabled ? (
          'Désactivé'
        ) : (
          `${open} mission${open > 1 ? 's' : ''} ouverte${open > 1 ? 's' : ''} · actif ${timeAgo(agent.last_active_at)}`
        )}
      </div>
    </button>
  )
}

/** Organigramme : CEO, puis ses rapports directs ; QA rattachée au CTO. */
export function OrgChart({ onOpen }: { onOpen: (id: string) => void }) {
  const agents = useAiStore((s) => s.agents)
  const ceo = agents.find((a) => !a.reports_to)
  const direct = agents.filter((a) => a.reports_to === ceo?.id)
  if (!ceo) return null
  return (
    <div className="overflow-x-auto pb-2">
      <div className="mx-auto min-w-[860px] max-w-6xl">
        <div className="mx-auto w-64">
          <AgentCard agent={ceo} onOpen={() => onOpen(ceo.id)} />
        </div>
        <div className="mx-auto h-6 w-px bg-line-strong" />
        <div className="relative grid gap-4" style={{ gridTemplateColumns: `repeat(${direct.length}, minmax(0, 1fr))` }}>
          <div className="absolute top-0 h-px bg-line-strong" style={{ left: `${50 / direct.length}%`, right: `${50 / direct.length}%` }} />
          {direct.map((a) => {
            const reports = agents.filter((x) => x.reports_to === a.id)
            return (
              <div key={a.id} className="flex flex-col items-center">
                <div className="h-6 w-px bg-line-strong" />
                <AgentCard agent={a} onOpen={() => onOpen(a.id)} />
                {reports.map((r) => (
                  <div key={r.id} className="flex w-full flex-col items-center">
                    <div className="h-6 w-px bg-line-strong" />
                    <AgentCard agent={r} onOpen={() => onOpen(r.id)} />
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl bg-canvas px-3 py-2.5">
      <div className="text-xs font-semibold text-ink-3">{label}</div>
      <div className="font-display text-xl font-bold text-ink tabular-nums">{value}</div>
      {hint && <div className="text-xs text-ink-3">{hint}</div>}
    </div>
  )
}

export function AgentDialog({ id, onClose, onOpenMission }: { id: string | null; onClose: () => void; onOpenMission: (id: string) => void }) {
  const data = useAiStore()
  const agent = data.agents.find((a) => a.id === id)
  const [memory, setMemory] = useState<string | null>(null)
  if (!agent) return null
  const m = agentMetrics(agent, data)
  const missions = data.missions.filter((x) => x.owner === agent.id).slice(0, 12)
  const manager = data.agents.find((a) => a.id === agent.reports_to)

  return (
    <Dialog open onClose={onClose} size="xl" title={`${agent.name} — ${agent.title}`} description={agent.mission}>
      <div className="grid gap-6 lg:grid-cols-[1fr_1.15fr]">
        <div className="space-y-5">
          <div className="flex items-center gap-4">
            <AgentAvatar agent={agent} size={64} ring />
            <div className="text-sm text-ink-2">
              <p>{agent.personality}</p>
              <p className="mt-1 text-ink-3">{manager ? `Rend compte à ${manager.name} (${manager.title})` : 'Dirige l’organisation'} · actif {timeAgo(agent.last_active_at)}</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Missions ouvertes" value={m.open} />
            <Stat label="Terminées (7 j)" value={m.done7d} hint={`${m.doneTotal} au total`} />
            <Stat label="Taux de réussite" value={m.successRate === null ? '—' : `${m.successRate} %`} />
            <Stat label="Durée moyenne" value={m.avgMinutes === null ? '—' : `${m.avgMinutes} min`} />
            <Stat label="Jetons (30 j)" value={formatTokens(m.tokens30d)} hint={`${m.calls30d} appels`} />
            <Stat label="Erreurs d’outils" value={m.toolErrors} hint={`${m.messagesSent} messages · ${m.decisions} décisions`} />
          </div>
          <section>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-ink"><Target size={16} /> Compétences et objectifs</h3>
            <div className="flex flex-wrap gap-1.5">
              {agent.skills.map((s) => (
                <span key={s} className="rounded-md bg-novia-50 px-2 py-0.5 text-xs font-semibold text-novia-700">{s}</span>
              ))}
            </div>
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-ink-2">
              {agent.objectives.map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-ink"><Wrench size={16} /> Outils autorisés</h3>
            <div className="flex flex-wrap gap-1.5">
              {agent.tools.map((t) => (
                <span key={t} className="rounded-md bg-canvas px-2 py-0.5 text-xs text-ink-2 ring-1 ring-line" title={t}>{TOOL_LABELS[t] ?? t}</span>
              ))}
            </div>
          </section>
          <Switch
            checked={agent.enabled}
            label="Agent actif"
            description="Un agent désactivé ne reçoit plus de missions et ne travaille plus."
            onChange={async (v) => {
              try {
                await aiDb.updateAgent(agent.id, { enabled: v })
              } catch (e) {
                toast.error((e as Error).message)
              }
            }}
          />
        </div>
        <div className="space-y-5">
          <section>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-ink"><Brain size={16} /> Mémoire de travail</h3>
            {memory === null ? (
              <div className="rounded-xl bg-canvas p-3 text-sm whitespace-pre-wrap text-ink-2">
                {agent.memory || 'Vide pour l’instant : l’agent y consigne ce qu’il doit retenir d’une mission à l’autre.'}
                <div className="mt-2">
                  <Button size="xs" variant="ghost" onClick={() => setMemory(agent.memory)}>Modifier</Button>
                </div>
              </div>
            ) : (
              <div>
                <textarea className="field min-h-32 text-sm" value={memory} maxLength={1500} onChange={(e) => setMemory(e.target.value)} />
                <div className="mt-2 flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setMemory(null)}>Annuler</Button>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={async () => {
                      await aiDb.updateAgent(agent.id, { memory })
                      setMemory(null)
                      toast.success('Mémoire mise à jour.')
                    }}
                  >
                    Enregistrer
                  </Button>
                </div>
              </div>
            )}
          </section>
          <section>
            <h3 className="mb-2 text-sm font-bold text-ink">Historique des missions</h3>
            {missions.length === 0 ? (
              <p className="text-sm text-ink-3">Aucune mission pour l’instant.</p>
            ) : (
              <ul className="divide-y divide-line rounded-xl ring-1 ring-line">
                {missions.map((x) => (
                  <li key={x.id}>
                    <button type="button" onClick={() => onOpenMission(x.id)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-canvas">
                      <span className="min-w-0 flex-1 truncate font-semibold text-ink">{x.title}</span>
                      <PriorityChip priority={x.priority} />
                      <MissionStatusChip status={x.status} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </Dialog>
  )
}
