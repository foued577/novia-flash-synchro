// Indicateurs de performance par agent, calculés à partir des données chargées.
import type { AgentUsage, AiActivity, AiAgent, AiDecision, AiMessage, AiMission } from './types'

export interface AgentMetrics {
  open: number
  inProgress: number
  done7d: number
  doneTotal: number
  blocked: number
  successRate: number | null
  avgMinutes: number | null
  tokens30d: number
  calls30d: number
  toolErrors: number
  messagesSent: number
  decisions: number
}

export function agentMetrics(agent: AiAgent, d: { missions: AiMission[]; activity: AiActivity[]; usage: AgentUsage[]; messages: AiMessage[]; decisions: AiDecision[] }): AgentMetrics {
  const mine = d.missions.filter((m) => m.owner === agent.id)
  const done = mine.filter((m) => m.status === 'done')
  const week = Date.now() - 7 * 86400000
  const finished = mine.filter((m) => ['done', 'blocked', 'cancelled'].includes(m.status))
  const durations = done.filter((m) => m.started_at && m.completed_at).map((m) => (new Date(m.completed_at!).getTime() - new Date(m.started_at!).getTime()) / 60000)
  const usage = d.usage.filter((u) => u.agent_id === agent.id)
  return {
    open: mine.filter((m) => ['proposed', 'todo', 'in_progress', 'waiting_validation', 'blocked'].includes(m.status)).length,
    inProgress: mine.filter((m) => m.status === 'in_progress').length,
    done7d: done.filter((m) => m.completed_at && new Date(m.completed_at).getTime() > week).length,
    doneTotal: done.length,
    blocked: mine.filter((m) => m.status === 'blocked').length,
    successRate: finished.length ? Math.round((done.length / finished.length) * 100) : null,
    avgMinutes: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
    tokens30d: usage.reduce((s, u) => s + u.tokens_in + u.tokens_out, 0),
    calls30d: usage.length,
    toolErrors: d.activity.filter((a) => a.agent_id === agent.id && a.kind === 'tool_error').length,
    messagesSent: d.messages.filter((m) => m.channel === 'agents' && m.sender === agent.id).length,
    decisions: d.decisions.filter((x) => x.decided_by === agent.id).length,
  }
}
