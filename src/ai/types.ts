// Types de l'AI Company (miroir des tables ai_* de Supabase).

export type AgentId = 'ceo' | 'cto' | 'rssi' | 'ba' | 'qa' | 'support' | 'data'

export interface AiAgent {
  id: AgentId
  name: string
  title: string
  mission: string
  personality: string
  skills: string[]
  objectives: string[]
  tools: string[]
  color: string
  position: number
  reports_to: AgentId | null
  enabled: boolean
  memory: string
  status: 'idle' | 'working' | 'waiting'
  current_mission: string | null
  last_active_at: string | null
}

export type MissionStatus = 'proposed' | 'todo' | 'in_progress' | 'waiting_validation' | 'blocked' | 'done' | 'cancelled'
export type Priority = 'low' | 'normal' | 'high' | 'critical'

export interface AiMission {
  id: string
  title: string
  description: string
  status: MissionStatus
  priority: Priority
  owner: AgentId | null
  created_by: string
  parent_id: string | null
  depends_on: string[]
  result: string
  due_date: string | null
  attempts: number
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface AiMissionEvent {
  id: string
  mission_id: string
  actor: string
  kind: string
  content: string
  created_at: string
}

export interface AiMessage {
  id: string
  channel: 'ceo_chat' | 'agents'
  sender: string
  recipient: string
  mission_id: string | null
  content: string
  read_at: string | null
  created_at: string
}

export type DecisionStatus = 'info' | 'pending' | 'approved' | 'rejected' | 'applied' | 'failed'

export interface AiDecision {
  id: string
  title: string
  context: string
  decision: string
  rationale: string
  decided_by: string
  status: DecisionStatus
  risk: 'low' | 'medium' | 'high'
  action: { type: string; params: Record<string, unknown> } | null
  mission_id: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  review_note: string
  outcome: string
  created_at: string
}

export interface AiActivity {
  id: string
  agent_id: string | null
  run_id: string | null
  mission_id: string | null
  kind: string
  summary: string
  details: unknown
  tokens_in: number
  tokens_out: number
  duration_ms: number
  created_at: string
}

export interface AiRun {
  id: string
  trigger: string
  status: 'running' | 'done' | 'failed'
  started_by: string | null
  started_at: string
  ended_at: string | null
  tokens_in: number
  tokens_out: number
  summary: string
  error: string
}

export interface AiReport {
  id: string
  report_date: string
  author: string
  kind: 'daily' | 'audit' | 'analysis' | 'incident'
  title: string
  content: string
  created_at: string
}

export interface AiSettings {
  enabled: boolean
  model: string
  autonomy: 'observe' | 'supervised' | 'autonomous'
  daily_token_budget: number
  max_steps: number
  scheduled: boolean
}

export interface SupportRequest {
  id: string
  author_id: string | null
  category: 'bug' | 'question' | 'suggestion' | 'access'
  subject: string
  body: string
  status: 'new' | 'in_progress' | 'answered' | 'closed'
  response: string
  responded_at: string | null
  created_at: string
  updated_at: string
}

export interface AiStatus {
  configured: boolean
  cron: boolean
  tokensToday: number
  running: { id: string; trigger: string; started_at: string } | null
}

/** Consommation par agent sur 30 jours (appels au modèle). */
export interface AgentUsage {
  agent_id: string
  tokens_in: number
  tokens_out: number
  duration_ms: number
  created_at: string
}
