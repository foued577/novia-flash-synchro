// État de l'AI Company : chargement depuis Supabase, temps réel, appels à l'orchestrateur.
import type { RealtimeChannel } from '@supabase/supabase-js'
import { create } from 'zustand'
import { getSupabaseClient } from '@/data'
import type { AgentUsage, AiActivity, AiAgent, AiDecision, AiMessage, AiMission, AiMissionEvent, AiReport, AiRun, AiSettings, AiStatus, SupportRequest } from './types'

interface AiState {
  loaded: boolean
  error: string | null
  agents: AiAgent[]
  missions: AiMission[]
  messages: AiMessage[]
  decisions: AiDecision[]
  activity: AiActivity[]
  usage: AgentUsage[]
  runs: AiRun[]
  reports: AiReport[]
  requests: SupportRequest[]
  settings: AiSettings | null
  status: AiStatus | null
  chatPending: boolean
  load(): Promise<void>
  refreshStatus(): Promise<void>
  start(): () => void
  invoke<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<T>
  chat(message: string): Promise<{ reply: string; delegated: number }>
  missionEvents(id: string): Promise<AiMissionEvent[]>
}

function client() {
  const c = getSupabaseClient()
  if (!c) throw new Error('L’AI Company nécessite Supabase.')
  return c
}

async function rows<T>(query: PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data ?? []
}

let channel: RealtimeChannel | null = null
let timer: number | undefined

export const useAiStore = create<AiState>((set, get) => ({
  loaded: false,
  error: null,
  agents: [],
  missions: [],
  messages: [],
  decisions: [],
  activity: [],
  usage: [],
  runs: [],
  reports: [],
  requests: [],
  settings: null,
  status: null,
  chatPending: false,

  async load() {
    try {
      const db = client()
      const since = new Date(Date.now() - 30 * 86400000).toISOString()
      const [agents, missions, messages, decisions, activity, usage, runs, reports, requests, settings] = await Promise.all([
        rows<AiAgent>(db.from('ai_agents').select('*').order('position')),
        rows<AiMission>(db.from('ai_missions').select('*').order('updated_at', { ascending: false }).limit(400)),
        rows<AiMessage>(db.from('ai_messages').select('*').order('created_at', { ascending: false }).limit(400)),
        rows<AiDecision>(db.from('ai_decisions').select('*').order('created_at', { ascending: false }).limit(200)),
        rows<AiActivity>(db.from('ai_activity').select('*').neq('kind', 'llm').order('created_at', { ascending: false }).limit(300)),
        rows<AgentUsage>(db.from('ai_activity').select('agent_id, tokens_in, tokens_out, duration_ms, created_at').eq('kind', 'llm').gte('created_at', since).limit(5000)),
        rows<AiRun>(db.from('ai_runs').select('*').order('started_at', { ascending: false }).limit(40)),
        rows<AiReport>(db.from('ai_reports').select('*').order('created_at', { ascending: false }).limit(80)),
        rows<SupportRequest>(db.from('support_requests').select('*').order('created_at', { ascending: false }).limit(200)),
        rows<AiSettings>(db.from('ai_settings').select('*').eq('id', 1)),
      ])
      set({ loaded: true, error: null, agents, missions, messages: messages.reverse(), decisions, activity, usage, runs, reports, requests, settings: settings[0] ?? null })
    } catch (error) {
      set({ loaded: true, error: error instanceof Error ? error.message : 'Chargement impossible' })
    }
  },

  async refreshStatus() {
    try {
      const status = await get().invoke<AiStatus>({ action: 'status' })
      set({ status })
    } catch {
      /* état facultatif */
    }
  },

  start() {
    void get().load()
    void get().refreshStatus()
    const db = client()
    const reload = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        void get().load()
        void get().refreshStatus()
      }, 600)
    }
    channel = db.channel(`ai-company-${Math.random().toString(36).slice(2, 8)}`)
    for (const table of ['ai_agents', 'ai_missions', 'ai_messages', 'ai_decisions', 'ai_activity', 'ai_runs', 'ai_reports', 'support_requests']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, reload)
    }
    channel.subscribe()
    const poll = window.setInterval(() => void get().refreshStatus(), 30000)
    return () => {
      window.clearInterval(poll)
      if (channel) void db.removeChannel(channel)
      channel = null
    }
  },

  async invoke<T>(body: Record<string, unknown>): Promise<T> {
    const { data, error } = await client().functions.invoke('ai-company', { body })
    if (error) {
      let message = error.message
      const response = (error as { context?: Response }).context
      if (response && typeof response.json === 'function') {
        const payload = await response.json().catch(() => null)
        if (payload?.error) message = payload.error
      }
      if (/Failed to send a request/i.test(message)) message = 'Orchestrateur injoignable : vérifiez que la fonction « ai-company » est déployée.'
      throw new Error(message)
    }
    return data as T
  },

  async chat(message) {
    set({ chatPending: true })
    try {
      return await get().invoke<{ reply: string; delegated: number }>({ action: 'chat', message })
    } finally {
      set({ chatPending: false })
      void get().load()
    }
  },

  async missionEvents(id) {
    return rows<AiMissionEvent>(client().from('ai_mission_events').select('*').eq('mission_id', id).order('created_at'))
  },
}))

/** Écritures directes de l'administrateur (protégées par la RLS « admin »). */
export const aiDb = {
  async updateMission(id: string, patch: Partial<AiMission>, note: string) {
    const db = client()
    const { error } = await db.from('ai_missions').update(patch).eq('id', id)
    if (error) throw new Error(error.message)
    await db.from('ai_mission_events').insert({ mission_id: id, actor: 'human', kind: 'update', content: note })
  },
  async createMission(input: Pick<AiMission, 'title' | 'description' | 'owner' | 'priority'>) {
    const db = client()
    const { data, error } = await db.from('ai_missions').insert({ ...input, created_by: 'human', status: 'todo' }).select('id').single()
    if (error) throw new Error(error.message)
    await db.from('ai_mission_events').insert({ mission_id: data.id, actor: 'human', kind: 'created', content: `Créée par la direction et assignée à ${input.owner}.` })
    return data.id as string
  },
  async addNote(id: string, note: string) {
    const { error } = await client().from('ai_mission_events').insert({ mission_id: id, actor: 'human', kind: 'note', content: note })
    if (error) throw new Error(error.message)
  },
  async sendToAgent(to: string, content: string) {
    const { error } = await client().from('ai_messages').insert({ channel: 'agents', sender: 'human', recipient: to, content })
    if (error) throw new Error(error.message)
  },
  async saveSettings(patch: Partial<AiSettings>) {
    const { error } = await client().from('ai_settings').update(patch).eq('id', 1)
    if (error) throw new Error(error.message)
  },
  async updateAgent(id: string, patch: Partial<AiAgent>) {
    const { error } = await client().from('ai_agents').update(patch).eq('id', id)
    if (error) throw new Error(error.message)
  },
  async answerRequest(id: string, response: string, status: SupportRequest['status']) {
    const { error } = await client().from('support_requests').update({ response, status, responded_at: new Date().toISOString() }).eq('id', id)
    if (error) throw new Error(error.message)
  },
}
