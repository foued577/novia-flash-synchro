import { clsx } from 'clsx'
import { ArrowRight, KeyRound } from 'lucide-react'
import { env } from '@/config/env'
import { agentMetrics } from '../metrics'
import { useAiStore } from '../store'
import { AgentAvatar, agentById, formatTokens, Markdown, MissionStatusChip, PriorityChip, timeAgo } from '../ui'

export function SetupBanner() {
  const status = useAiStore((s) => s.status)
  if (!status || status.configured) return null
  const ref = /https:\/\/([a-z0-9]+)\.supabase\.co/.exec(env.supabaseUrl)?.[1]
  return (
    <div className="mb-6 flex gap-4 rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
      <KeyRound className="mt-0.5 shrink-0 text-amber-700" size={20} />
      <div className="text-sm text-amber-950">
        <p className="font-semibold">Les agents attendent leur clé d’accès à Claude.</p>
        <p className="mt-1">
          Créez une clé sur la console Anthropic, puis ajoutez-la dans Supabase sous le nom <code className="rounded bg-white px-1">ANTHROPIC_API_KEY</code> (Edge Functions → Secrets). Elle reste côté serveur : elle n’apparaît jamais dans l’application.
        </p>
        <div className="mt-2 flex flex-wrap gap-4 font-semibold">
          <a className="underline" href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">Console Anthropic</a>
          {ref && <a className="underline" href={`https://supabase.com/dashboard/project/${ref}/functions/secrets`} target="_blank" rel="noreferrer">Secrets Supabase</a>}
        </div>
      </div>
    </div>
  )
}

function Tile({ label, value, hint, tone }: { label: string; value: string | number; hint?: string; tone?: string }) {
  return (
    <div className="panel h-full px-5 py-4">
      <div className="text-sm font-semibold text-ink-3">{label}</div>
      <div className={clsx('mt-1 font-display text-3xl font-bold tabular-nums', tone ?? 'text-ink')}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-ink-3">{hint}</div>}
    </div>
  )
}

export function Overview({ go, onOpenAgent, onOpenMission }: { go: (tab: string) => void; onOpenAgent: (id: string) => void; onOpenMission: (id: string) => void }) {
  const data = useAiStore()
  const { agents, missions, decisions, activity, reports, requests, status, settings } = data
  const week = Date.now() - 7 * 86400000
  const open = missions.filter((m) => ['todo', 'in_progress', 'waiting_validation', 'blocked', 'proposed'].includes(m.status))
  const pending = decisions.filter((d) => d.status === 'pending').length
  const done7 = missions.filter((m) => m.status === 'done' && m.completed_at && new Date(m.completed_at).getTime() > week).length
  const budget = settings?.daily_token_budget ?? 0
  const used = status?.tokensToday ?? 0
  const working = agents.filter((a) => a.status === 'working')
  const current = open.slice().sort((a, b) => ['critical', 'high', 'normal', 'low'].indexOf(a.priority) - ['critical', 'high', 'normal', 'low'].indexOf(b.priority)).slice(0, 8)
  const lastDaily = reports.find((r) => r.kind === 'daily')

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Tile label="Missions ouvertes" value={open.length} hint={`${open.filter((m) => m.status === 'in_progress').length} en cours · ${open.filter((m) => m.status === 'blocked').length} bloquée(s)`} />
        <Tile label="Terminées sur 7 jours" value={done7} />
        <button type="button" onClick={() => go('validations')} className="h-full text-left">
          <Tile label="À valider par vous" value={pending} tone={pending ? 'text-violet-700' : undefined} hint={pending ? 'Ouvrir les validations' : 'Aucune action en attente'} />
        </button>
        <Tile label="Demandes utilisateurs" value={requests.filter((r) => r.status === 'new' || r.status === 'in_progress').length} hint="ouvertes" />
        <div className="panel px-5 py-4">
          <div className="text-sm font-semibold text-ink-3">Jetons aujourd’hui</div>
          <div className="mt-1 font-display text-3xl font-bold text-ink tabular-nums">{formatTokens(used)}</div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
            <div className={clsx('h-full rounded-full', used / budget > 0.85 ? 'bg-red-500' : 'bg-novia-500')} style={{ width: `${budget ? Math.min(100, (used / budget) * 100) : 0}%` }} />
          </div>
          <div className="mt-1 text-xs text-ink-3">sur {formatTokens(budget)} autorisés</div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <section className="panel">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <h2 className="font-bold text-ink">Tâches en cours</h2>
            <button type="button" onClick={() => go('missions')} className="inline-flex items-center gap-1 text-sm font-semibold text-novia-600">Toutes les missions <ArrowRight size={14} /></button>
          </div>
          {current.length === 0 ? (
            <p className="px-5 py-8 text-sm text-ink-3">Aucune mission ouverte. Donnez une orientation à la CEO dans le chat pour lancer l’organisation.</p>
          ) : (
            <ul className="divide-y divide-line">
              {current.map((m) => {
                const owner = agentById(agents, m.owner)
                return (
                  <li key={m.id}>
                    <button type="button" onClick={() => onOpenMission(m.id)} className="flex w-full items-center gap-3 px-5 py-2.5 text-left hover:bg-canvas">
                      <AgentAvatar agent={owner} size={28} ring />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink">{m.title}</span>
                        <span className="block text-xs text-ink-3">{owner?.name ?? '—'} · mise à jour {timeAgo(m.updated_at)}</span>
                      </span>
                      {m.priority !== 'normal' && <PriorityChip priority={m.priority} />}
                      <MissionStatusChip status={m.status} />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="panel">
          <div className="border-b border-line px-5 py-3">
            <h2 className="font-bold text-ink">En ce moment</h2>
          </div>
          <div className="px-5 py-4">
            {working.length === 0 ? (
              <p className="text-sm text-ink-3">{status?.running ? 'Cycle en cours de démarrage…' : 'Aucun agent ne travaille en ce moment.'}</p>
            ) : (
              <ul className="space-y-2">
                {working.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 text-sm">
                    <AgentAvatar agent={a} size={28} ring />
                    <span className="font-semibold text-ink">{a.name}</span>
                    <span className="truncate text-ink-2">{missions.find((m) => m.id === a.current_mission)?.title ?? 'traite ses messages'}</span>
                  </li>
                ))}
              </ul>
            )}
            <h3 className="mt-5 mb-2 text-sm font-bold text-ink">Derniers événements</h3>
            <ul className="space-y-2">
              {activity.filter((a) => a.kind !== 'tool').slice(0, 7).map((a) => (
                <li key={a.id} className="flex gap-2 text-sm">
                  <AgentAvatar agent={agentById(agents, a.agent_id)} size={20} />
                  <span className="min-w-0 flex-1 text-ink-2"><span className="line-clamp-2">{a.summary}</span></span>
                  <span className="shrink-0 text-xs text-ink-3">{timeAgo(a.created_at)}</span>
                </li>
              ))}
              {activity.length === 0 && <li className="text-sm text-ink-3">Rien pour l’instant.</li>}
            </ul>
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <section className="panel overflow-x-auto">
          <h2 className="border-b border-line px-5 py-3 font-bold text-ink">Performance des agents</h2>
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-ink-3">
                <th className="px-5 py-2">Agent</th>
                <th className="px-3 py-2 text-right">Ouvertes</th>
                <th className="px-3 py-2 text-right">Terminées 7 j</th>
                <th className="px-3 py-2 text-right">Réussite</th>
                <th className="px-3 py-2 text-right">Durée moy.</th>
                <th className="px-3 py-2 text-right">Erreurs</th>
                <th className="px-5 py-2 text-right">Jetons 30 j</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {agents.map((a) => {
                const m = agentMetrics(a, data)
                return (
                  <tr key={a.id} className="cursor-pointer hover:bg-canvas" onClick={() => onOpenAgent(a.id)}>
                    <td className="px-5 py-2">
                      <span className="flex items-center gap-2 font-semibold text-ink">
                        <AgentAvatar agent={a} size={24} /> {a.name} <span className="font-normal text-ink-3">{a.title}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{m.open}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{m.done7d}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{m.successRate === null ? '—' : `${m.successRate} %`}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{m.avgMinutes === null ? '—' : `${m.avgMinutes} min`}</td>
                    <td className={clsx('px-3 py-2 text-right tabular-nums', m.toolErrors > 0 && 'text-red-700')}>{m.toolErrors}</td>
                    <td className="px-5 py-2 text-right tabular-nums">{formatTokens(m.tokens30d)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
        <section className="panel">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <h2 className="font-bold text-ink">Dernier rapport quotidien</h2>
            <button type="button" onClick={() => go('rapports')} className="inline-flex items-center gap-1 text-sm font-semibold text-novia-600">Rapports <ArrowRight size={14} /></button>
          </div>
          <div className="max-h-80 overflow-y-auto px-5 py-4 scrollbar-thin">
            {lastDaily ? <Markdown text={lastDaily.content} /> : <p className="text-sm text-ink-3">Pas encore de rapport. Utilisez « Rapport du jour » en haut de la page.</p>}
          </div>
        </section>
      </div>
    </div>
  )
}
