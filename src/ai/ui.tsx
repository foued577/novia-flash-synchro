// Éléments d'affichage partagés de l'AI Company.
import { clsx } from 'clsx'
import { Fragment, type ReactNode } from 'react'
import type { AiAgent, DecisionStatus, MissionStatus, Priority } from './types'

export const MISSION_STATUS: Record<MissionStatus, { label: string; tone: string; dot: string }> = {
  proposed: { label: 'Proposée', tone: 'bg-slate-100 text-slate-700', dot: '#94A3B8' },
  todo: { label: 'À faire', tone: 'bg-novia-50 text-novia-700', dot: '#4570BE' },
  in_progress: { label: 'En cours', tone: 'bg-amber-50 text-amber-800', dot: '#D99A1C' },
  waiting_validation: { label: 'Validation humaine', tone: 'bg-violet-50 text-violet-800', dot: '#7C55B0' },
  blocked: { label: 'Bloquée', tone: 'bg-red-50 text-red-800', dot: '#C0504D' },
  done: { label: 'Terminée', tone: 'bg-emerald-50 text-emerald-800', dot: '#2F8F4E' },
  cancelled: { label: 'Annulée', tone: 'bg-slate-100 text-slate-500', dot: '#A3ACB9' },
}

export const PRIORITY: Record<Priority, { label: string; tone: string }> = {
  critical: { label: 'Critique', tone: 'bg-red-600 text-white' },
  high: { label: 'Haute', tone: 'bg-orange-100 text-orange-800' },
  normal: { label: 'Normale', tone: 'bg-slate-100 text-slate-700' },
  low: { label: 'Basse', tone: 'bg-slate-50 text-slate-500' },
}

export const DECISION_STATUS: Record<DecisionStatus, { label: string; tone: string }> = {
  info: { label: 'Consignée', tone: 'bg-slate-100 text-slate-700' },
  pending: { label: 'En attente', tone: 'bg-violet-100 text-violet-800' },
  approved: { label: 'Approuvée', tone: 'bg-emerald-50 text-emerald-800' },
  applied: { label: 'Appliquée', tone: 'bg-emerald-100 text-emerald-900' },
  rejected: { label: 'Refusée', tone: 'bg-red-50 text-red-800' },
  failed: { label: 'Échec', tone: 'bg-red-100 text-red-900' },
}

export const RISK = { low: { label: 'Risque faible', tone: 'text-emerald-700' }, medium: { label: 'Risque moyen', tone: 'text-amber-700' }, high: { label: 'Risque élevé', tone: 'text-red-700' } }

export const ACTION_LABELS: Record<string, string> = {
  ensure_meeting: 'Créer la réunion d’une semaine',
  set_support_request_status: 'Changer le statut d’une demande',
  answer_support_request: 'Répondre à un utilisateur',
  update_service_duration: 'Modifier un temps de parole',
  update_meeting_settings: 'Modifier l’organisation de la réunion',
  update_user_role: 'Modifier un rôle',
}

export const TOOL_LABELS: Record<string, string> = {
  get_app_overview: 'Vue d’ensemble',
  get_meeting_status: 'État des réunions',
  get_kpi_history: 'Historique des indicateurs',
  get_usage_stats: 'Statistiques d’usage',
  run_security_audit: 'Audit de sécurité',
  run_health_checks: 'Contrôles de cohérence',
  get_database_overview: 'État de la base',
  list_support_requests: 'Demandes utilisateurs',
  list_agents: 'Annuaire des agents',
  list_missions: 'Liste des missions',
  get_mission: 'Détail d’une mission',
  create_mission: 'Créer / déléguer une mission',
  update_mission: 'Mettre à jour une mission',
  add_mission_note: 'Annoter une mission',
  send_message: 'Messagerie',
  record_decision: 'Consigner une décision',
  propose_action: 'Proposer une action',
  write_report: 'Publier un rapport',
  read_activity: 'Lire le journal',
  update_memory: 'Mémoire de travail',
}

export function Chip({ className, children }: { className?: string; children: ReactNode }) {
  return <span className={clsx('inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap', className)}>{children}</span>
}

export function MissionStatusChip({ status }: { status: MissionStatus }) {
  const s = MISSION_STATUS[status]
  return <Chip className={s.tone}>{s.label}</Chip>
}

export function PriorityChip({ priority }: { priority: Priority }) {
  return <Chip className={PRIORITY[priority].tone}>{PRIORITY[priority].label}</Chip>
}

/** Monogramme d'agent : initiales du rôle sur la couleur de l'agent. */
export function AgentAvatar({ agent, size = 36, ring = false }: { agent?: Pick<AiAgent, 'title' | 'color' | 'status' | 'name'> | null; size?: number; ring?: boolean }) {
  if (!agent) {
    return (
      <span className="grid shrink-0 place-items-center rounded-full bg-ink text-white" style={{ width: size, height: size, fontSize: size * 0.34 }} aria-hidden>
        <span className="font-display font-bold">D</span>
      </span>
    )
  }
  const label = size < 30 ? agent.name.charAt(0) : agent.title === 'Business Analyst' ? 'BA' : agent.title === 'QA Engineer' ? 'QA' : agent.title === 'Support Manager' ? 'SUP' : agent.title === 'Data Analyst' ? 'DATA' : agent.title
  return (
    <span className="relative inline-grid shrink-0 place-items-center rounded-full text-white" style={{ width: size, height: size, background: agent.color }} aria-hidden>
      <span className="font-display font-extrabold tracking-tight" style={{ fontSize: Math.max(9, size * (label.length === 1 ? 0.45 : label.length > 3 ? 0.24 : 0.3)) }}>
        {label}
      </span>
      {ring && agent.status === 'working' && <span className="absolute -inset-1 animate-pulse-soft rounded-full ring-2 ring-emerald-400" />}
    </span>
  )
}

export function agentById(agents: AiAgent[], id: string | null | undefined) {
  return agents.find((a) => a.id === id) ?? null
}

export function actorLabel(agents: AiAgent[], id: string | null | undefined) {
  if (!id || id === 'human') return 'Direction'
  const a = agentById(agents, id)
  return a ? `${a.name} · ${a.title}` : id
}

export function timeAgo(iso: string | null | undefined) {
  if (!iso) return 'jamais'
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 45) return 'à l’instant'
  if (diff < 3600) return `il y a ${Math.round(diff / 60)} min`
  if (diff < 86400) return `il y a ${Math.round(diff / 3600)} h`
  if (diff < 7 * 86400) return `il y a ${Math.round(diff / 86400)} j`
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

export function dateTime(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function formatTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M`
  if (n >= 1000) return `${Math.round(n / 1000).toLocaleString('fr-FR')} k`
  return n.toLocaleString('fr-FR')
}

// -----------------------------------------------------------------------------
// Markdown minimal (titres, listes, gras, italique, code, liens) — sans HTML brut.
// -----------------------------------------------------------------------------

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g
  let last = 0
  let m: RegExpExecArray | null
  let k = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const t = m[0]
    if (t.startsWith('**')) out.push(<strong key={k++}>{t.slice(2, -2)}</strong>)
    else if (t.startsWith('`')) out.push(<code key={k++} className="rounded bg-canvas px-1 py-0.5 text-[0.9em]">{t.slice(1, -1)}</code>)
    else if (t.startsWith('[')) {
      const [, label, href] = /\[([^\]]+)\]\(([^)]+)\)/.exec(t)!
      out.push(<a key={k++} href={href} target="_blank" rel="noreferrer" className="font-semibold text-novia-600 underline">{label}</a>)
    } else out.push(<em key={k++}>{t.slice(1, -1)}</em>)
    last = m.index + t.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  const lines = text.replace(/\r/g, '').split('\n')
  const blocks: ReactNode[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  let para: string[] = []
  const flushPara = () => {
    if (para.length) blocks.push(<p key={blocks.length}>{inline(para.join(' '))}</p>)
    para = []
  }
  const flushList = () => {
    if (!list) return
    const items = list.items.map((it, i) => <li key={i}>{inline(it)}</li>)
    blocks.push(list.ordered ? <ol key={blocks.length} className="list-decimal space-y-1 pl-5">{items}</ol> : <ul key={blocks.length} className="list-disc space-y-1 pl-5">{items}</ul>)
    list = null
  }
  for (const raw of lines) {
    const line = raw.trimEnd()
    const h = /^(#{1,4})\s+(.*)$/.exec(line)
    const ul = /^\s*[-*•]\s+(.*)$/.exec(line)
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line)
    if (!line.trim()) {
      flushPara()
      flushList()
    } else if (h) {
      flushPara()
      flushList()
      const level = h[1].length
      blocks.push(
        <p key={blocks.length} className={clsx('font-display font-bold text-ink', level <= 2 ? 'mt-4 text-[17px]' : 'mt-3 text-[15px]')}>
          {inline(h[2])}
        </p>,
      )
    } else if (ul || ol) {
      flushPara()
      const ordered = !!ol
      if (!list || list.ordered !== ordered) {
        flushList()
        list = { ordered, items: [] }
      }
      list.items.push((ul ?? ol)![1])
    } else if (/^\s*(---|\*\*\*)\s*$/.test(line)) {
      flushPara()
      flushList()
      blocks.push(<hr key={blocks.length} className="border-line" />)
    } else {
      flushList()
      para.push(line.trim())
    }
  }
  flushPara()
  flushList()
  return <div className={clsx('space-y-2 text-[15px] leading-relaxed text-ink-2 [&_strong]:text-ink', className)}>{blocks.map((b, i) => <Fragment key={i}>{b}</Fragment>)}</div>
}
