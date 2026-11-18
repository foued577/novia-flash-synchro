import { clsx } from 'clsx'
import { Check, FileText, Inbox, ScrollText, ShieldCheck, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Form'
import { EmptyState } from '@/components/ui/Misc'
import { useAppStore } from '@/store/useAppStore'
import { aiDb, useAiStore } from '../store'
import type { AiDecision, SupportRequest } from '../types'
import { ACTION_LABELS, actorLabel, AgentAvatar, agentById, Chip, dateTime, DECISION_STATUS, formatTokens, Markdown, RISK, timeAgo } from '../ui'

// -----------------------------------------------------------------------------
// Validations humaines et historique des décisions
// -----------------------------------------------------------------------------

function DecisionCard({ decision, onOpenMission }: { decision: AiDecision; onOpenMission: (id: string) => void }) {
  const agents = useAiStore((s) => s.agents)
  const invoke = useAiStore((s) => s.invoke)
  const missions = useAiStore((s) => s.missions)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<'yes' | 'no' | null>(null)
  const author = agentById(agents, decision.decided_by)
  const mission = missions.find((m) => m.id === decision.mission_id)
  const pending = decision.status === 'pending'
  const snapshot = useAppStore((s) => s.snapshot)
  const PARAM_LABELS: Record<string, string> = { service_id: 'Service', user_id: 'Compte', minutes: 'Minutes', role: 'Rôle', request_id: 'Demande', response: 'Réponse', status: 'Statut', year: 'Année', week: 'Semaine', close: 'Clôturer' }
  const show = (k: string, v: unknown) => {
    if (k === 'service_id') return snapshot?.services.find((x) => x.id === v)?.name ?? String(v)
    if (k === 'user_id') return snapshot?.users.find((x) => x.id === v)?.fullName ?? String(v)
    if (k === 'role') return ({ admin: 'Administrateur', manager: 'Responsable de service', viewer: 'Collaborateur' } as Record<string, string>)[String(v)] ?? String(v)
    return typeof v === 'string' ? v : JSON.stringify(v)
  }

  const decide = async (approve: boolean) => {
    setBusy(approve ? 'yes' : 'no')
    try {
      const res = await invoke<{ status: string; outcome: string }>({ action: 'decide', decisionId: decision.id, approve, note })
      if (res.status === 'failed') toast.error(`Action en échec : ${res.outcome}`)
      else toast.success(approve ? (res.outcome || 'Validé.') : 'Refusé : l’agent en tiendra compte.')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <article className={clsx('rounded-xl bg-white p-4 ring-1', pending ? 'ring-violet-200' : 'ring-line')}>
      <div className="flex flex-wrap items-center gap-2">
        <AgentAvatar agent={author} size={28} />
        <span className="text-sm font-semibold text-ink">{actorLabel(agents, decision.decided_by)}</span>
        <Chip className={DECISION_STATUS[decision.status].tone}>{DECISION_STATUS[decision.status].label}</Chip>
        {decision.action && <span className={clsx('text-xs font-semibold', RISK[decision.risk].tone)}>{RISK[decision.risk].label}</span>}
        <span className="ml-auto text-xs text-ink-3">{dateTime(decision.created_at)}</span>
      </div>
      <h3 className="mt-2 font-display text-[16px] font-bold text-ink">{decision.title}</h3>
      {decision.action && (
        <div className="mt-2 rounded-lg bg-canvas px-3 py-2 text-sm">
          <span className="font-semibold text-ink">Action : {ACTION_LABELS[decision.action.type] ?? decision.action.type}</span>
          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-ink-2">
            {Object.entries(decision.action.params ?? {}).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-ink-3">{PARAM_LABELS[k] ?? k}</dt>
                <dd className="break-words">{show(k, v)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {!decision.action && decision.decision && <Markdown className="mt-2" text={decision.decision} />}
      {decision.rationale && <p className="mt-2 text-sm text-ink-2"><span className="font-semibold text-ink">Justification : </span>{decision.rationale}</p>}
      {decision.context && !decision.action && <p className="mt-1 text-sm text-ink-3">{decision.context}</p>}
      {mission && (
        <button type="button" onClick={() => onOpenMission(mission.id)} className="mt-2 text-xs font-semibold text-novia-600 hover:underline">
          Mission : {mission.title}
        </button>
      )}
      {pending ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <input className="field field-sm min-w-48 flex-1" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Commentaire pour l’agent (facultatif)" />
          <Button size="sm" variant="danger" icon={X} loading={busy === 'no'} disabled={!!busy} onClick={() => decide(false)}>Refuser</Button>
          <Button size="sm" variant="primary" icon={Check} loading={busy === 'yes'} disabled={!!busy} onClick={() => decide(true)}>
            {decision.action ? 'Valider et exécuter' : 'Approuver'}
          </Button>
        </div>
      ) : (
        (decision.outcome || decision.review_note) && (
          <p className="mt-2 text-xs text-ink-3">
            {decision.reviewed_at && `Traitée ${timeAgo(decision.reviewed_at)}. `}
            {decision.outcome && `Résultat : ${decision.outcome}. `}
            {decision.review_note && `Commentaire : ${decision.review_note}`}
          </p>
        )
      )}
    </article>
  )
}

export function Decisions({ onOpenMission }: { onOpenMission: (id: string) => void }) {
  const decisions = useAiStore((s) => s.decisions)
  const [filter, setFilter] = useState('')
  const pending = decisions.filter((d) => d.status === 'pending')
  const history = decisions.filter((d) => d.status !== 'pending' && (!filter || d.status === filter))
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-[17px] font-bold">
          <ShieldCheck size={18} className="text-violet-700" /> En attente de votre validation
          <span className="text-sm font-semibold text-ink-3">{pending.length}</span>
        </h2>
        {pending.length === 0 ? (
          <div className="panel">
            <EmptyState icon={ShieldCheck} title="Rien à valider">
              Les actions sensibles proposées par les agents apparaissent ici. Elles ne sont exécutées qu’après votre accord.
            </EmptyState>
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map((d) => (
              <DecisionCard key={d.id} decision={d} onOpenMission={onOpenMission} />
            ))}
          </div>
        )}
      </section>
      <section>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="flex items-center gap-2 text-[17px] font-bold"><ScrollText size={18} /> Historique des décisions</h2>
          <Select className="field-sm ml-auto w-44" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filtrer">
            <option value="">Toutes</option>
            {(['info', 'applied', 'approved', 'rejected', 'failed'] as const).map((s) => (
              <option key={s} value={s}>{DECISION_STATUS[s].label}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-3">
          {history.slice(0, 40).map((d) => (
            <DecisionCard key={d.id} decision={d} onOpenMission={onOpenMission} />
          ))}
          {history.length === 0 && <p className="text-sm text-ink-3">Aucune décision consignée.</p>}
        </div>
      </section>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Journal d'activité et cycles
// -----------------------------------------------------------------------------

const KIND_LABELS: Record<string, string> = {
  tool: 'Outil',
  tool_error: 'Erreur',
  mission: 'Mission',
  inbox: 'Messages',
  chat: 'Chat',
  validation: 'Validation',
}

const TRIGGERS: Record<string, string> = { manual: 'Cycle manuel', chat: 'Chat', 'chat+cycle': 'Chat + cycle', cron: 'Cycle planifié', report: 'Rapport', 'cron-report': 'Rapport planifié' }

export function ActivityLog({ onOpenMission }: { onOpenMission: (id: string) => void }) {
  const activity = useAiStore((s) => s.activity)
  const runs = useAiStore((s) => s.runs)
  const agents = useAiStore((s) => s.agents)
  const [agent, setAgent] = useState('')
  const [tools, setTools] = useState(false)
  const list = useMemo(() => activity.filter((a) => (!agent || a.agent_id === agent) && (tools || a.kind !== 'tool')), [activity, agent, tools])

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <section className="panel">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
          <h3 className="font-bold text-ink">Journal d’activité</h3>
          <label className="ml-auto flex items-center gap-2 text-sm text-ink-2">
            <input type="checkbox" checked={tools} onChange={(e) => setTools(e.target.checked)} /> Appels d’outils
          </label>
          <Select className="field-sm w-48" value={agent} onChange={(e) => setAgent(e.target.value)} aria-label="Agent">
            <option value="">Tous les agents</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.title}</option>
            ))}
          </Select>
        </div>
        {list.length === 0 ? (
          <EmptyState icon={ScrollText} title="Journal vide">Chaque action des agents y est enregistrée.</EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {list.map((a) => (
              <li key={a.id} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                <AgentAvatar agent={agentById(agents, a.agent_id)} size={26} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <Chip className={a.kind === 'tool_error' ? 'bg-red-50 text-red-800' : 'bg-canvas text-ink-2'}>{KIND_LABELS[a.kind] ?? a.kind}</Chip>
                    <span className="ml-auto shrink-0 text-xs text-ink-3">{dateTime(a.created_at)}</span>
                  </div>
                  <p className="mt-0.5 text-ink-2">{a.summary}</p>
                  {a.mission_id && (
                    <button type="button" onClick={() => onOpenMission(a.mission_id!)} className="text-xs font-semibold text-novia-600 hover:underline">Voir la mission</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="panel h-fit">
        <h3 className="border-b border-line px-4 py-3 font-bold text-ink">Cycles de travail</h3>
        <ul className="divide-y divide-line">
          {runs.map((r) => (
            <li key={r.id} className="px-4 py-3 text-sm">
              <div className="flex items-center gap-2">
                <span className={clsx('size-2 rounded-full', r.status === 'running' ? 'animate-pulse-soft bg-amber-500' : r.status === 'done' ? 'bg-emerald-500' : 'bg-red-500')} />
                <span className="font-semibold text-ink">{TRIGGERS[r.trigger] ?? r.trigger}</span>
                <span className="ml-auto text-xs text-ink-3">{dateTime(r.started_at)}</span>
              </div>
              <div className="mt-0.5 text-xs text-ink-3">
                {formatTokens(r.tokens_in + r.tokens_out)} jetons
                {r.ended_at && ` · ${Math.round((new Date(r.ended_at).getTime() - new Date(r.started_at).getTime()) / 1000)} s`}
              </div>
              {r.summary && <p className="mt-1 text-xs whitespace-pre-wrap text-ink-2">{r.summary.slice(0, 400)}</p>}
              {r.error && <p className="mt-1 text-xs whitespace-pre-wrap text-red-700">{r.error.slice(0, 300)}</p>}
            </li>
          ))}
          {runs.length === 0 && <li className="px-4 py-6 text-sm text-ink-3">Aucun cycle lancé.</li>}
        </ul>
      </section>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Rapports
// -----------------------------------------------------------------------------

const REPORT_KINDS = { daily: 'Quotidien', audit: 'Audit', analysis: 'Analyse', incident: 'Incident' }

export function Reports() {
  const reports = useAiStore((s) => s.reports)
  const agents = useAiStore((s) => s.agents)
  const [selected, setSelected] = useState<string | null>(null)
  const current = reports.find((r) => r.id === selected) ?? reports[0]
  if (!reports.length)
    return (
      <div className="panel">
        <EmptyState icon={FileText} title="Aucun rapport pour l’instant">
          Lancez « Rapport du jour » : la CEO synthétise l’activité, les missions, les décisions en attente et les risques.
        </EmptyState>
      </div>
    )
  return (
    <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
      <ul className="panel h-fit divide-y divide-line">
        {reports.map((r) => (
          <li key={r.id}>
            <button type="button" onClick={() => setSelected(r.id)} className={clsx('w-full px-4 py-3 text-left hover:bg-canvas', current?.id === r.id && 'bg-novia-50')}>
              <div className="text-sm font-semibold text-ink">{r.title}</div>
              <div className="text-xs text-ink-3">
                {REPORT_KINDS[r.kind]} · {actorLabel(agents, r.author)} · {new Date(r.report_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
              </div>
            </button>
          </li>
        ))}
      </ul>
      {current && (
        <article className="panel p-6">
          <div className="mb-4 flex items-center gap-3">
            <AgentAvatar agent={agentById(agents, current.author)} size={36} />
            <div>
              <h2 className="font-display text-xl font-bold text-ink">{current.title}</h2>
              <p className="text-sm text-ink-3">{REPORT_KINDS[current.kind]} · {actorLabel(agents, current.author)} · {dateTime(current.created_at)}</p>
            </div>
          </div>
          <Markdown text={current.content} />
        </article>
      )}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Demandes des utilisateurs
// -----------------------------------------------------------------------------

export const REQUEST_STATUS: Record<SupportRequest['status'], { label: string; tone: string }> = {
  new: { label: 'Nouvelle', tone: 'bg-novia-50 text-novia-700' },
  in_progress: { label: 'En cours', tone: 'bg-amber-50 text-amber-800' },
  answered: { label: 'Répondue', tone: 'bg-emerald-50 text-emerald-800' },
  closed: { label: 'Clôturée', tone: 'bg-slate-100 text-slate-600' },
}
export const REQUEST_CATEGORY = { bug: 'Problème', question: 'Question', suggestion: 'Suggestion', access: 'Accès' }

export function Requests() {
  const requests = useAiStore((s) => s.requests)
  const [open, setOpen] = useState<string | null>(null)
  const [answer, setAnswer] = useState('')
  return (
    <div className="panel">
      <div className="border-b border-line px-4 py-3">
        <h3 className="font-bold text-ink">Demandes des utilisateurs</h3>
        <p className="text-sm text-ink-3">Envoyées depuis « Aide et demandes ». Nadia (Support) les qualifie et prépare les réponses ; les réponses passent par votre validation.</p>
      </div>
      {requests.length === 0 ? (
        <EmptyState icon={Inbox} title="Aucune demande">Les utilisateurs peuvent signaler un problème ou proposer une amélioration depuis le menu de leur compte.</EmptyState>
      ) : (
        <ul className="divide-y divide-line">
          {requests.map((r) => (
            <li key={r.id} className="px-4 py-3">
              <button type="button" className="flex w-full items-center gap-2 text-left" onClick={() => { setOpen(open === r.id ? null : r.id); setAnswer(r.response) }}>
                <Chip className={REQUEST_STATUS[r.status].tone}>{REQUEST_STATUS[r.status].label}</Chip>
                <span className="text-xs font-semibold text-ink-3">{REQUEST_CATEGORY[r.category]}</span>
                <span className="min-w-0 flex-1 truncate font-semibold text-ink">{r.subject}</span>
                <span className="text-xs text-ink-3">{timeAgo(r.created_at)}</span>
              </button>
              {open === r.id && (
                <div className="mt-3 space-y-3 pl-1">
                  <p className="text-sm whitespace-pre-wrap text-ink-2">{r.body || '(sans détail)'}</p>
                  <textarea className="field min-h-24 text-sm" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Réponse visible par la personne" />
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => aiDb.answerRequest(r.id, r.response, 'closed').then(() => toast.success('Demande clôturée.'))}>Clôturer</Button>
                    <Button size="sm" variant="primary" disabled={answer.trim().length < 3} onClick={() => aiDb.answerRequest(r.id, answer.trim(), 'answered').then(() => toast.success('Réponse envoyée.'))}>Répondre</Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
