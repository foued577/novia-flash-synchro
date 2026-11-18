// NOVIA Flash Synchro — orchestrateur de l'AI Company (fonction Edge Supabase).
//
// Appels (POST JSON, jeton d'un administrateur ou en-tête x-ai-cron-secret) :
//   { action: 'status' }
//   { action: 'chat', message }                → réponse du CEO (+ cycle lancé si missions créées)
//   { action: 'run_cycle' }                     → cycle de travail en arrière-plan
//   { action: 'daily_report' }                  → rapport quotidien en arrière-plan
//   { action: 'decide', decisionId, approve, note } → validation humaine
//
// Secrets : ANTHROPIC_API_KEY (obligatoire). Tâches planifiées : jeton interne
// public.ai_private.cron_token (pg_cron) ou secret AI_CRON_SECRET.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { BudgetError, chatWithCeo, cycleRound, dailyReport, log, tokensToday } from './engine.ts'
import { type Agent, type Ctx, executeAction, missionEvent, type Settings } from './tools.ts'

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ai-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

/** Budget de temps d'une invocation (limite Supabase : 150 s en offre gratuite). */
const DEADLINE_MS = 120_000

async function loadCtx(db: SupabaseClient, runId: string | null): Promise<Ctx> {
  const [{ data: settings }, { data: agents }] = await Promise.all([
    db.from('ai_settings').select('*').eq('id', 1).single(),
    db.from('ai_agents').select('*').order('position'),
  ])
  return { db, settings: settings as Settings, agents: (agents ?? []) as Agent[], runId, created: new Map() }
}

async function startRun(db: SupabaseClient, trigger: string, userId: string | null) {
  await db.from('ai_runs').update({ status: 'failed', ended_at: new Date().toISOString(), error: 'Interrompu (délai dépassé)' }).eq('status', 'running').lt('started_at', new Date(Date.now() - 6 * 60000).toISOString())
  const { data: running } = await db.from('ai_runs').select('id, trigger').eq('status', 'running').limit(1).maybeSingle()
  if (running) return { conflict: running }
  const { data, error } = await db.from('ai_runs').insert({ trigger, started_by: userId }).select('id').single()
  if (error) throw error
  return { id: data.id as string }
}

async function finishRun(db: SupabaseClient, id: string, status: 'done' | 'failed', summary: string, error = '') {
  await db.from('ai_runs').update({ status, summary: summary.slice(0, 2000), error: error.slice(0, 2000), ended_at: new Date().toISOString() }).eq('id', id)
}

/** Enchaîne des tours de travail tant qu'il reste du travail prêt et du temps. */
async function workLoop(db: SupabaseClient, runId: string, startedAt: number) {
  const done: string[] = []
  const errors: string[] = []
  try {
    for (let round = 1; round <= 4; round++) {
      if (Date.now() - startedAt > DEADLINE_MS - 45_000) break
      const ctx = await loadCtx(db, runId)
      if (!ctx.settings.enabled) break
      const r = await cycleRound(ctx)
      done.push(...r.worked.map((w) => `Tour ${round} — ${w}`))
      errors.push(...r.errors)
      if (r.budget || r.worked.length === 0) break
    }
    const summary = done.length ? done.join('\n') : 'Aucun travail prêt : pas de mission à traiter ni de message en attente.'
    await finishRun(db, runId, errors.length && !done.length ? 'failed' : 'done', summary, errors.join('\n'))
  } catch (e) {
    await finishRun(db, runId, 'failed', done.join('\n'), (e as Error).message)
  }
}

function background(p: Promise<unknown>) {
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(p)
  else void p
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405)
  const startedAt = Date.now()
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } })

  // --- Authentification : administrateur connecté, ou tâche planifiée -------
  let userId: string | null = null
  let userName = 'la direction'
  const cronSecret = Deno.env.get('AI_CRON_SECRET')
  const cronHeader = req.headers.get('x-ai-cron-secret')
  let viaCron = false
  if (cronHeader && cronHeader.length >= 32) {
    if (cronSecret && cronHeader === cronSecret) viaCron = true
    else {
      const { data: priv } = await db.from('ai_private').select('cron_token').eq('id', 1).maybeSingle()
      viaCron = !!priv?.cron_token && priv.cron_token === cronHeader
    }
    if (!viaCron) return json({ error: 'Jeton de planification invalide.' }, 401)
  }
  if (!viaCron) {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    if (!token) return json({ error: 'Connexion requise.' }, 401)
    const { data, error } = await db.auth.getUser(token)
    if (error || !data.user) return json({ error: 'Session expirée : reconnectez-vous.' }, 401)
    const { data: profile } = await db.from('profiles').select('role, full_name').eq('id', data.user.id).maybeSingle()
    if (profile?.role !== 'admin') return json({ error: 'Réservé aux administrateurs.' }, 403)
    userId = data.user.id
    userName = profile.full_name || userName
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Requête invalide.' }, 400)
  }
  const action = String(body.action ?? '')
  if (viaCron && !['run_cycle', 'daily_report', 'status'].includes(action)) return json({ error: 'Action non permise pour une tâche planifiée.' }, 403)

  try {
    // --- État -------------------------------------------------------------------
    if (action === 'status') {
      const ctx = await loadCtx(db, null)
      const { data: running } = await db.from('ai_runs').select('id, trigger, started_at').eq('status', 'running').limit(1).maybeSingle()
      return json({ configured: !!Deno.env.get('ANTHROPIC_API_KEY'), cron: !!ctx.settings.scheduled, settings: ctx.settings, running, tokensToday: await tokensToday(ctx) })
    }

    // --- Validation humaine -----------------------------------------------------
    if (action === 'decide') {
      if (!userId) return json({ error: 'Validation réservée à un administrateur.' }, 403)
      const id = String(body.decisionId ?? '')
      const approve = body.approve === true
      const note = String(body.note ?? '').slice(0, 2000)
      const { data: decision } = await db.from('ai_decisions').select('*').eq('id', id).maybeSingle()
      if (!decision) return json({ error: 'Décision introuvable.' }, 404)
      if (decision.status !== 'pending') return json({ error: 'Cette décision a déjà été traitée.' }, 409)
      let status = approve ? 'approved' : 'rejected'
      let outcome = ''
      if (approve && decision.action) {
        try {
          outcome = await executeAction(db, decision.action)
          status = 'applied'
        } catch (e) {
          outcome = (e as Error).message
          status = 'failed'
        }
      }
      await db.from('ai_decisions').update({ status, outcome, review_note: note, reviewed_by: userId, reviewed_at: new Date().toISOString() }).eq('id', id)
      const ctx = await loadCtx(db, null)
      await log(ctx, { agent_id: decision.decided_by, mission_id: decision.mission_id, kind: 'validation', summary: `${userName} a ${approve ? 'validé' : 'refusé'} « ${decision.title} »${outcome ? ` — ${outcome}` : ''}` })
      if (decision.mission_id) {
        const { data: mission } = await db.from('ai_missions').select('status').eq('id', decision.mission_id).maybeSingle()
        await missionEvent(db, decision.mission_id, 'human', approve ? 'approved' : 'rejected', `${userName} a ${approve ? 'validé' : 'refusé'} : ${decision.title}${note ? `\nCommentaire : ${note}` : ''}${outcome ? `\nRésultat : ${outcome}` : ''}`)
        if (mission?.status === 'waiting_validation') await db.from('ai_missions').update({ status: 'todo' }).eq('id', decision.mission_id)
      }
      return json({ status, outcome })
    }

    const ctx = await loadCtx(db, null)
    if (viaCron) {
      // Tâche planifiée : silencieuse si désactivée, en pause ou sans clé.
      if (!ctx.settings.enabled || !ctx.settings.scheduled || !Deno.env.get('ANTHROPIC_API_KEY')) return json({ skipped: true })
      if (action === 'daily_report') {
        const since = new Date(Date.now() - 24 * 3600000).toISOString()
        const { count } = await db.from('ai_activity').select('id', { count: 'exact', head: true }).neq('kind', 'llm').gte('created_at', since)
        if (!count) return json({ skipped: true, reason: 'Aucune activité aujourd’hui.' })
      }
    }
    if (!ctx.settings.enabled) return json({ error: 'L’AI Company est en pause (Paramètres IA).' }, 409)
    if (!Deno.env.get('ANTHROPIC_API_KEY')) return json({ error: 'Clé ANTHROPIC_API_KEY absente : ajoutez-la dans Supabase → Edge Functions → Secrets.' }, 412)

    // --- Chat avec le CEO -----------------------------------------------------------
    if (action === 'chat') {
      const message = String(body.message ?? '').trim().slice(0, 4000)
      if (!message) return json({ error: 'Message vide.' }, 400)
      const run = await startRun(db, 'chat', userId)
      if ('conflict' in run) return json({ error: 'Un cycle de travail est déjà en cours : réessayez dans un instant.' }, 409)
      ctx.runId = run.id
      let reply: string
      try {
        reply = await chatWithCeo(ctx, userName, message)
      } catch (e) {
        await finishRun(db, run.id, 'failed', '', (e as Error).message)
        if (e instanceof BudgetError) return json({ error: e.message }, 429)
        throw e
      }
      const delegated = [...ctx.created.values()].reduce((a, b) => a + b, 0)
      if (delegated > 0) {
        await db.from('ai_runs').update({ trigger: 'chat+cycle' }).eq('id', run.id)
        background(workLoop(db, run.id, startedAt))
      } else await finishRun(db, run.id, 'done', 'Conversation avec la direction.')
      return json({ reply, delegated, runId: run.id })
    }

    // --- Cycle de travail -------------------------------------------------------
    if (action === 'run_cycle') {
      const run = await startRun(db, viaCron ? 'cron' : 'manual', userId)
      if ('conflict' in run) return json({ error: 'Un cycle est déjà en cours.' }, 409)
      background(workLoop(db, run.id, startedAt))
      return json({ runId: run.id })
    }

    // --- Rapport quotidien ------------------------------------------------------
    if (action === 'daily_report') {
      const run = await startRun(db, viaCron ? 'cron-report' : 'report', userId)
      if ('conflict' in run) return json({ error: 'Un cycle est déjà en cours.' }, 409)
      ctx.runId = run.id
      background(
        dailyReport(ctx)
          .then((o) => finishRun(db, run.id, 'done', o.text || 'Rapport quotidien publié.'))
          .catch((e) => finishRun(db, run.id, 'failed', '', (e as Error).message)),
      )
      return json({ runId: run.id })
    }

    return json({ error: 'Action inconnue.' }, 400)
  } catch (e) {
    console.error(e)
    return json({ error: (e as Error).message }, 500)
  }
})
