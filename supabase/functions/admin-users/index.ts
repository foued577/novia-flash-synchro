// NOVIA Flash Synchro — gestion des comptes par l'administrateur.
// Fonction Edge Supabase : la clé service_role reste côté serveur
// (variable SUPABASE_SERVICE_ROLE_KEY fournie automatiquement par Supabase).
//
// Actions (POST JSON) :
//   { action: 'create', email, fullName, jobTitle, role, serviceId, mode: 'password' | 'invite', redirectTo? }
//   { action: 'reset',  userId }   → nouveau mot de passe provisoire
//   { action: 'delete', userId }
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ROLES = ['admin', 'manager', 'viewer'] as const
type Role = (typeof ROLES)[number]

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

/** Mot de passe provisoire lisible (sans caractères ambigus). */
function temporaryPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  const raw = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

  // 1. Qui appelle ? Doit être un administrateur de l'application.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'Connexion requise.' }, 401)
  const { data: caller, error: callerError } = await admin.auth.getUser(token)
  if (callerError || !caller.user) return json({ error: 'Session expirée : reconnectez-vous.' }, 401)
  const { data: callerProfile } = await admin.from('profiles').select('role').eq('id', caller.user.id).maybeSingle()
  if (callerProfile?.role !== 'admin') return json({ error: 'Réservé aux administrateurs.' }, 403)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Requête invalide.' }, 400)
  }

  // 2. Création d'un compte
  if (body.action === 'create') {
    const email = String(body.email ?? '').trim().toLowerCase()
    const fullName = String(body.fullName ?? '').trim()
    const jobTitle = String(body.jobTitle ?? '').trim()
    const role = (ROLES.includes(body.role as Role) ? body.role : 'viewer') as Role
    const serviceId = role === 'manager' && typeof body.serviceId === 'string' && body.serviceId ? body.serviceId : null
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Adresse e-mail invalide.' }, 400)
    if (!fullName) return json({ error: 'Le nom est obligatoire.' }, 400)
    if (role === 'manager' && !serviceId) return json({ error: 'Choisissez le service du responsable.' }, 400)

    let userId: string
    let password: string | null = null
    if (body.mode === 'invite') {
      const redirectTo = typeof body.redirectTo === 'string' ? body.redirectTo : undefined
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { data: { full_name: fullName }, redirectTo })
      if (error) return json({ error: /already/i.test(error.message) ? 'Un compte existe déjà pour cette adresse.' : /rate limit/i.test(error.message) ? 'Limite d’envoi d’e-mails atteinte : réessayez plus tard ou utilisez un mot de passe provisoire.' : `Invitation impossible : ${error.message}` }, 400)
      userId = data.user.id
    } else {
      password = temporaryPassword()
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName, must_change_password: true },
      })
      if (error) return json({ error: /already/i.test(error.message) ? 'Un compte existe déjà pour cette adresse.' : `Création impossible : ${error.message}` }, 400)
      userId = data.user.id
    }

    // Le déclencheur handle_new_user crée le profil ; on le complète.
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .upsert({ id: userId, email, full_name: fullName, job_title: jobTitle, role, service_id: serviceId }, { onConflict: 'id' })
      .select('*')
      .single()
    if (profileError) return json({ error: `Profil non enregistré : ${profileError.message}` }, 500)
    return json({ profile, password })
  }

  // 3. Nouveau mot de passe provisoire
  if (body.action === 'reset') {
    const userId = String(body.userId ?? '')
    const password = temporaryPassword()
    const { data: existing, error: getError } = await admin.auth.admin.getUserById(userId)
    if (getError || !existing.user) return json({ error: 'Compte introuvable.' }, 404)
    const { error } = await admin.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
      user_metadata: { ...existing.user.user_metadata, must_change_password: true },
    })
    if (error) return json({ error: `Réinitialisation impossible : ${error.message}` }, 400)
    return json({ password })
  }

  // 4. Suppression
  if (body.action === 'delete') {
    const userId = String(body.userId ?? '')
    if (userId === caller.user.id) return json({ error: 'Vous ne pouvez pas supprimer votre propre compte.' }, 400)
    const { error } = await admin.auth.admin.deleteUser(userId)
    if (error) return json({ error: `Suppression impossible : ${error.message}` }, 400)
    return json({ ok: true })
  }

  return json({ error: 'Action inconnue.' }, 400)
})
