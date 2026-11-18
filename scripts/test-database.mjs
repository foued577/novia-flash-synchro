// Vérifie le schéma Supabase sur un PostgreSQL embarqué (PGlite) :
// migrations, données initiales, semaines ISO, création hebdomadaire et droits par rôle (RLS).
// Usage : npm run test:db
/* oxlint-disable no-unused-expressions -- style « condition ? ok() : fail() » volontaire dans ce script de vérification */
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'

const ROOT = new URL('../supabase', import.meta.url).pathname
const db = new PGlite()
const ok = (label) => console.log('  ✓', label)
const fail = (label, e) => { console.log('  ✗', label, '—', e?.message ?? e); process.exitCode = 1 }
async function expectError(label, fn, pattern) {
  try { await fn(); fail(label, 'aucune erreur levée') } catch (e) { if (!pattern || pattern.test(e.message)) ok(`${label} (refusé : ${e.message.slice(0, 70)})`); else fail(label, e) }
}

// --- Environnement Supabase minimal ------------------------------------------
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb, last_sign_in_at timestamptz, email_confirmed_at timestamptz);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  grant usage on schema public, auth, storage to authenticated;
  grant execute on function auth.uid() to authenticated;
`)

for (const f of ['20261117000001_schema.sql', '20261117000002_security.sql', '20261117000003_storage.sql', '20261117000004_weekly_meetings.sql', '20261118000005_hardening.sql', '20261118000006_table_grants.sql', '20261118000007_ai_company.sql']) {
  try { await db.exec(readFileSync(`${ROOT}/migrations/${f}`, 'utf8')); ok(`migration ${f}`) } catch (e) { fail(`migration ${f}`, e); process.exit(1) }
}
await db.exec(`grant all on all tables in schema public to authenticated; grant all on storage.objects to authenticated;`)
for (const f of ['seed.sql', 'demo-data.sql']) {
  try { await db.exec(readFileSync(`${ROOT}/${f}`, 'utf8')); ok(f) } catch (e) { fail(f, e); process.exit(1) }
}

const one = async (sql, params) => (await db.query(sql, params)).rows[0]
console.log('\nSemaines ISO')
const w = await one(`select public.iso_week_start(2026,47) a, public.iso_week_start(2027,1) b, public.iso_week_start(2026,53) c, public.iso_week_start(2026,42) d`)
const fmt = (d) => new Date(d).toISOString().slice(0, 10)
;[['2026-W47 → 2026-11-16', fmt(w.a) === '2026-11-16'], ['2027-W01 → 2027-01-04', fmt(w.b) === '2027-01-04'], ['2026-W53 → 2026-12-28', fmt(w.c) === '2026-12-28'], ['2026-W42 → 2026-10-12', fmt(w.d) === '2026-10-12']].forEach(([l, v]) => (v ? ok(l) : fail(l, JSON.stringify(w))))

console.log('\nComptes et profils')
const ADMIN = '00000000-0000-4000-8000-0000000000a1', MANAGER = '00000000-0000-4000-8000-0000000000b2', VIEWER = '00000000-0000-4000-8000-0000000000c3'
await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values
  ('${ADMIN}', 'direction@cfa.fr', '{"full_name":"Direction"}'),
  ('${MANAGER}', 'commercial@cfa.fr', '{"full_name":"Resp. commercial"}'),
  ('${VIEWER}', 'collab@cfa.fr', '{}')`)
const roles = (await db.query(`select email, role from public.profiles order by email`)).rows
roles.find((r) => r.email === 'direction@cfa.fr')?.role === 'admin' ? ok('premier compte = administrateur') : fail('premier compte admin', JSON.stringify(roles))
roles.find((r) => r.email === 'collab@cfa.fr')?.role === 'viewer' ? ok('comptes suivants = collaborateurs') : fail('viewer', JSON.stringify(roles))
const COMMERCIAL = '5e1d0001-0000-4000-8000-000000000002', PEDA = '5e1d0001-0000-4000-8000-000000000001'
await db.exec(`update public.profiles set role = 'manager', service_id = '${COMMERCIAL}' where id = '${MANAGER}'`)

const as = async (uid, fn) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`)
  try { return await fn() } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`) }
}

console.log('\nCréation automatique hebdomadaire')
const last = await one(`select id, iso_year, iso_week from public.meetings order by week_start desc limit 1`)
const nextWeek = last.iso_week + 1
const newId = (await as(VIEWER, () => db.query(`select public.ensure_meeting_for_week($1, $2) id`, [last.iso_year, nextWeek]))).rows[0].id
newId ? ok(`réunion S${nextWeek} créée par un collaborateur via la fonction serveur`) : fail('création', newId)
const again = (await as(VIEWER, () => db.query(`select public.ensure_meeting_for_week($1, $2) id`, [last.iso_year, nextWeek]))).rows[0].id
again === newId ? ok('appel idempotent (pas de doublon)') : fail('idempotence', again)
const counts = await one(`select (select count(*) from public.slides where meeting_id = $1)::int s, (select count(*) from public.slides where meeting_id = $2)::int src, (select count(*) from public.submissions where meeting_id = $1)::int subs`, [newId, last.id])
counts.s === counts.src && counts.subs === 5 ? ok(`${counts.s} diapositives reprises, 5 statuts « brouillon »`) : fail('duplication', JSON.stringify(counts))
const kpi = await one(`select b->'items'->0 item from public.slides s, jsonb_array_elements(s.blocks) b where s.meeting_id = $1 and b->>'type' = 'kpis' limit 1`, [newId])
kpi.item.previous === kpi.item.value && kpi.item.value !== '' ? ok(`indicateur reporté en rappel (${kpi.item.label} : ${kpi.item.value})`) : fail('report KPI', JSON.stringify(kpi))
const m = await one(`select meeting_date, week_start, extract(isodow from meeting_date)::int dow from public.meetings where id = $1`, [newId])
m.dow === 4 ? ok(`date de réunion = jeudi ${fmt(m.meeting_date)}`) : fail('jour', JSON.stringify(m))
await expectError('anonyme refusé', () => db.query(`select public.ensure_meeting_for_week(2030, 1)`), /Authentification/)

console.log('\nDroits (RLS)')
const slideCom = (await db.query(`select id from public.slides where meeting_id = $1 and service_id = $2 limit 1`, [newId, COMMERCIAL])).rows[0].id
const slidePeda = (await db.query(`select id from public.slides where meeting_id = $1 and service_id = $2 limit 1`, [newId, PEDA])).rows[0].id
let r = await as(MANAGER, () => db.query(`update public.slides set notes = 'ok' where id = $1`, [slideCom]))
r.affectedRows === 1 ? ok('responsable : modifie une diapositive de son service') : fail('manager own', r.affectedRows)
r = await as(MANAGER, () => db.query(`update public.slides set notes = 'x' where id = $1`, [slidePeda]))
r.affectedRows === 0 ? ok('responsable : ne modifie pas un autre service') : fail('manager other', r.affectedRows)
r = await as(VIEWER, () => db.query(`update public.slides set notes = 'x' where id = $1`, [slideCom]))
r.affectedRows === 0 ? ok('collaborateur : lecture seule') : fail('viewer write', r.affectedRows)
r = await as(VIEWER, () => db.query(`select count(*)::int n from public.slides`))
r.rows[0].n > 0 ? ok('collaborateur : consultation des diapositives') : fail('viewer read', r.rows[0].n)
r = await as(MANAGER, () => db.query(`update public.submissions set status = 'submitted' where meeting_id = $1 and service_id = $2`, [newId, COMMERCIAL]))
r.affectedRows === 1 ? ok('responsable : soumet son contenu') : fail('submit', r.affectedRows)
const sub = await one(`select submitted_at, updated_by from public.submissions where meeting_id = $1 and service_id = $2`, [newId, COMMERCIAL])
sub.submitted_at && sub.updated_by === MANAGER ? ok('horodatage et auteur de la soumission enregistrés') : fail('stamp', JSON.stringify(sub))
r = await as(MANAGER, () => db.query(`update public.slides set notes = 'après soumission' where id = $1`, [slideCom]))
r.affectedRows === 0 ? ok('responsable : contenu verrouillé après soumission') : fail('locked', r.affectedRows)
await expectError('responsable : ne peut pas valider', () => as(MANAGER, () => db.query(`update public.submissions set status = 'validated' where meeting_id = $1 and service_id = $2`, [newId, COMMERCIAL])), /administrateur/)
r = await as(ADMIN, () => db.query(`update public.submissions set status = 'validated' where meeting_id = $1 and service_id = $2`, [newId, COMMERCIAL]))
r.affectedRows === 1 ? ok('administrateur : valide') : fail('admin validate', r.affectedRows)
await expectError('responsable : ne peut pas rouvrir un contenu validé', () => as(MANAGER, () => db.query(`update public.submissions set status = 'in_progress' where meeting_id = $1 and service_id = $2`, [newId, COMMERCIAL])), /rouvrir/)
await expectError('responsable : ne change pas son rôle', () => as(MANAGER, () => db.query(`update public.profiles set role = 'admin' where id = $1`, [MANAGER])), /administrateur/)
r = await as(MANAGER, () => db.query(`insert into public.meetings (iso_year, iso_week, week_start, week_end, meeting_date) values (2031, 2, '2031-01-06', '2031-01-12', '2031-01-09')`).catch((e) => e))
r instanceof Error ? ok('responsable : ne crée pas de réunion') : fail('manager meeting insert', 'inséré')
r = await as(ADMIN, () => db.query(`update public.meetings set status = 'ready' where id = $1`, [newId]))
r.affectedRows === 1 ? ok('administrateur : gère les réunions') : fail('admin meeting', r.affectedRows)
r = await as(MANAGER, () => db.query(`insert into storage.objects (bucket_id, name) values ('attachments', $1)`, [`${newId}/${PEDA}/x.pdf`]).catch((e) => e))
r instanceof Error ? ok('stockage : dépôt refusé hors de son service') : fail('storage other', 'inséré')
await db.exec(`update public.submissions set status = 'in_progress' where meeting_id = '${newId}' and service_id = '${COMMERCIAL}'`)
r = await as(MANAGER, () => db.query(`insert into storage.objects (bucket_id, name) values ('attachments', $1)`, [`${newId}/${COMMERCIAL}/rapport.pdf`]))
r.affectedRows === 1 ? ok('stockage : dépôt autorisé dans son service') : fail('storage own', r.affectedRows)
console.log('\nAI Company')
r = await as(ADMIN, () => db.query(`select count(*)::int n from public.ai_agents`))
r.rows[0].n === 7 ? ok('administrateur : voit les 7 agents') : fail('admin agents', r.rows[0].n)
r = await as(MANAGER, () => db.query(`select count(*)::int n from public.ai_agents`))
r.rows[0].n === 0 ? ok('responsable : aucun accès à l’AI Company') : fail('manager agents', r.rows[0].n)
r = await as(VIEWER, () => db.query(`insert into public.ai_missions (title) values ('intrus')`).catch((e) => e))
r instanceof Error ? ok('collaborateur : ne crée pas de mission') : fail('viewer mission', 'inséré')
r = await as(VIEWER, () => db.query(`insert into public.support_requests (category, subject, body) values ('bug', 'Export PDF vide', 'Le PDF est blanc')`))
r.affectedRows === 1 ? ok('collaborateur : envoie une demande au support') : fail('support insert', r.affectedRows)
r = await as(VIEWER, () => db.query(`insert into public.support_requests (subject, response) values ('Triche', 'auto-réponse')`).catch((e) => e))
r instanceof Error ? ok('collaborateur : ne peut pas écrire la réponse') : fail('support response', 'inséré')
r = await as(MANAGER, () => db.query(`select count(*)::int n from public.support_requests`))
r.rows[0].n === 0 ? ok('demandes : chacun ne voit que les siennes') : fail('support read', r.rows[0].n)
r = await as(ADMIN, () => db.query(`select count(*)::int n from public.support_requests`))
r.rows[0].n === 1 ? ok('administrateur : voit toutes les demandes') : fail('admin support', r.rows[0].n)
await expectError('outils d’audit interdits aux comptes', () => as(ADMIN, () => db.query(`select public.ai_security_audit()`)), /permission/)
for (const fn of ['ai_security_audit()', 'ai_health_checks()', 'ai_database_overview()', 'ai_usage_stats(8)']) {
  try { const v = (await one(`select public.${fn} v`)).v; v && typeof v === 'object' ? ok(`${fn} → ${Object.keys(v).length} indicateurs`) : fail(fn, v) } catch (e) { fail(fn, e) }
}
const audit = (await one(`select public.ai_security_audit() v`)).v
audit.tables_without_rls.length === 0 ? ok('audit : toutes les tables ont la RLS') : fail('RLS manquante', audit.tables_without_rls)

console.log(process.exitCode ? '\nÉCHECS détectés' : '\nTous les contrôles SQL sont passés.')
