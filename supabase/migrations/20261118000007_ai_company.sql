-- =============================================================================
-- NOVIA Flash Synchro — AI COMPANY
-- Organisation d'agents IA (CEO, CTO, RSSI, BA, QA, Support, Data) pilotée par
-- l'orchestrateur `supabase/functions/ai-company`.
--
-- Principes de sécurité :
--  * tables réservées aux administrateurs (RLS) ; les agents écrivent via la
--    fonction Edge (service_role), jamais depuis le navigateur ;
--  * aucun SQL libre pour les agents : uniquement des outils et fonctions
--    d'analyse en lecture seule définis ici ;
--  * toute action sensible passe par une décision « en attente » validée par un humain.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Paramètres
-- -----------------------------------------------------------------------------
create table if not exists public.ai_settings (
  id integer primary key default 1 check (id = 1),
  enabled boolean not null default true,
  model text not null default 'claude-sonnet-5-5',
  -- observe : analyse uniquement ; supervised : toute action validée par un humain ;
  -- autonomous : actions à faible risque exécutées directement, les autres validées.
  autonomy text not null default 'supervised' check (autonomy in ('observe', 'supervised', 'autonomous')),
  daily_token_budget integer not null default 400000 check (daily_token_budget between 10000 and 20000000),
  max_steps integer not null default 5 check (max_steps between 1 and 12),
  updated_at timestamptz not null default now()
);
insert into public.ai_settings (id) values (1) on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Agents
-- -----------------------------------------------------------------------------
create table if not exists public.ai_agents (
  id text primary key,
  name text not null,
  title text not null,
  mission text not null default '',
  personality text not null default '',
  skills text[] not null default '{}',
  objectives text[] not null default '{}',
  tools text[] not null default '{}',
  color text not null default '#3661B3',
  position integer not null default 0,
  reports_to text references public.ai_agents (id) on delete set null,
  enabled boolean not null default true,
  memory text not null default '',
  status text not null default 'idle' check (status in ('idle', 'working', 'waiting')),
  current_mission uuid,
  last_active_at timestamptz,
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Missions et historique
-- -----------------------------------------------------------------------------
create table if not exists public.ai_missions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  status text not null default 'todo'
    check (status in ('proposed', 'todo', 'in_progress', 'waiting_validation', 'blocked', 'done', 'cancelled')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'critical')),
  owner text references public.ai_agents (id) on delete set null,
  created_by text not null default 'human',
  parent_id uuid references public.ai_missions (id) on delete set null,
  depends_on uuid[] not null default '{}',
  result text not null default '',
  due_date date,
  attempts integer not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_missions_status_idx on public.ai_missions (status, priority);
create index if not exists ai_missions_owner_idx on public.ai_missions (owner);

create table if not exists public.ai_mission_events (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.ai_missions (id) on delete cascade,
  actor text not null,
  kind text not null,
  content text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists ai_mission_events_mission_idx on public.ai_mission_events (mission_id, created_at);

-- -----------------------------------------------------------------------------
-- Messages (chat avec le CEO et messagerie entre agents)
-- -----------------------------------------------------------------------------
create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('ceo_chat', 'agents')),
  sender text not null,
  recipient text not null,
  mission_id uuid references public.ai_missions (id) on delete set null,
  content text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists ai_messages_channel_idx on public.ai_messages (channel, created_at);
create index if not exists ai_messages_inbox_idx on public.ai_messages (recipient) where read_at is null;

-- -----------------------------------------------------------------------------
-- Décisions et validation humaine
-- -----------------------------------------------------------------------------
create table if not exists public.ai_decisions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  context text not null default '',
  decision text not null default '',
  rationale text not null default '',
  decided_by text not null,
  status text not null default 'pending' check (status in ('info', 'pending', 'approved', 'rejected', 'applied', 'failed')),
  risk text not null default 'low' check (risk in ('low', 'medium', 'high')),
  action jsonb,
  mission_id uuid references public.ai_missions (id) on delete set null,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  review_note text not null default '',
  outcome text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists ai_decisions_status_idx on public.ai_decisions (status, created_at);

-- -----------------------------------------------------------------------------
-- Journal d'activité, cycles et rapports
-- -----------------------------------------------------------------------------
create table if not exists public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  trigger text not null,
  status text not null default 'running' check (status in ('running', 'done', 'failed')),
  started_by uuid references public.profiles (id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  tokens_in integer not null default 0,
  tokens_out integer not null default 0,
  summary text not null default '',
  error text not null default ''
);

create table if not exists public.ai_activity (
  id uuid primary key default gen_random_uuid(),
  agent_id text references public.ai_agents (id) on delete set null,
  run_id uuid references public.ai_runs (id) on delete set null,
  mission_id uuid references public.ai_missions (id) on delete set null,
  kind text not null,
  summary text not null,
  details jsonb,
  tokens_in integer not null default 0,
  tokens_out integer not null default 0,
  duration_ms integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists ai_activity_created_idx on public.ai_activity (created_at desc);
create index if not exists ai_activity_agent_idx on public.ai_activity (agent_id, created_at desc);

create table if not exists public.ai_reports (
  id uuid primary key default gen_random_uuid(),
  report_date date not null default (now() at time zone 'Europe/Paris')::date,
  author text not null,
  kind text not null default 'daily' check (kind in ('daily', 'audit', 'analysis', 'incident')),
  title text not null,
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists ai_reports_date_idx on public.ai_reports (report_date desc, created_at desc);

-- -----------------------------------------------------------------------------
-- Demandes des utilisateurs (traitées par le Support Manager)
-- -----------------------------------------------------------------------------
create table if not exists public.support_requests (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references public.profiles (id) on delete set null default auth.uid(),
  category text not null default 'question' check (category in ('bug', 'question', 'suggestion', 'access')),
  subject text not null check (length(subject) between 3 and 200),
  body text not null default '' check (length(body) <= 5000),
  status text not null default 'new' check (status in ('new', 'in_progress', 'answered', 'closed')),
  response text not null default '',
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Horodatage
-- -----------------------------------------------------------------------------
drop trigger if exists ai_agents_touch on public.ai_agents;
create trigger ai_agents_touch before update on public.ai_agents for each row execute function public.touch_updated_at();
drop trigger if exists ai_missions_touch on public.ai_missions;
create trigger ai_missions_touch before update on public.ai_missions for each row execute function public.touch_updated_at();
drop trigger if exists ai_settings_touch on public.ai_settings;
create trigger ai_settings_touch before update on public.ai_settings for each row execute function public.touch_updated_at();
drop trigger if exists support_requests_touch on public.support_requests;
create trigger support_requests_touch before update on public.support_requests for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Sécurité : RLS
-- -----------------------------------------------------------------------------
alter table public.ai_settings enable row level security;
alter table public.ai_agents enable row level security;
alter table public.ai_missions enable row level security;
alter table public.ai_mission_events enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_decisions enable row level security;
alter table public.ai_runs enable row level security;
alter table public.ai_activity enable row level security;
alter table public.ai_reports enable row level security;
alter table public.support_requests enable row level security;

do $$
declare t text;
begin
  foreach t in array array['ai_settings', 'ai_agents', 'ai_missions', 'ai_mission_events', 'ai_messages', 'ai_decisions', 'ai_runs', 'ai_activity', 'ai_reports'] loop
    execute format('drop policy if exists %I on public.%I', t || '_admin', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t || '_admin', t);
  end loop;
end $$;

drop policy if exists support_requests_read on public.support_requests;
create policy support_requests_read on public.support_requests for select to authenticated
  using (author_id = auth.uid() or public.is_admin());
drop policy if exists support_requests_insert on public.support_requests;
create policy support_requests_insert on public.support_requests for insert to authenticated
  with check (author_id = auth.uid() and status = 'new' and response = '');
drop policy if exists support_requests_admin on public.support_requests;
create policy support_requests_admin on public.support_requests for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists support_requests_admin_delete on public.support_requests;
create policy support_requests_admin_delete on public.support_requests for delete to authenticated
  using (public.is_admin());

grant select, insert, update, delete on
  public.ai_settings, public.ai_agents, public.ai_missions, public.ai_mission_events, public.ai_messages,
  public.ai_decisions, public.ai_runs, public.ai_activity, public.ai_reports, public.support_requests
to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Outils d'analyse des agents (lecture seule, réservés à l'orchestrateur)
-- -----------------------------------------------------------------------------

-- Audit de sécurité (RSSI)
create or replace function public.ai_security_audit()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select jsonb_build_object(
    'tables_without_rls', coalesce((
      select jsonb_agg(c.relname order by c.relname)
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity), '[]'::jsonb),
    'policies_per_table', coalesce((
      select jsonb_object_agg(tablename, n) from (
        select tablename, count(*) n from pg_policies where schemaname = 'public' group by tablename) p), '{}'::jsonb),
    'tables_readable_by_anon', coalesce((
      select jsonb_agg(distinct table_name)
      from information_schema.role_table_grants
      where table_schema = 'public' and grantee = 'anon' and privilege_type = 'SELECT'), '[]'::jsonb),
    'security_definer_functions_executable_by_anon', coalesce((
      select jsonb_agg(p.proname order by p.proname)
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'EXECUTE')), '[]'::jsonb),
    'admins', (select count(*) from public.profiles where role = 'admin'),
    'managers_without_service', (select count(*) from public.profiles where role = 'manager' and service_id is null),
    'accounts_total', (select count(*) from auth.users),
    'accounts_never_signed_in', (select count(*) from auth.users where last_sign_in_at is null),
    'accounts_unconfirmed', (select count(*) from auth.users where email_confirmed_at is null),
    'public_storage_buckets', coalesce((select jsonb_agg(id) from storage.buckets where public), '[]'::jsonb),
    'checked_at', now()
  );
$$;

-- Contrôles de cohérence des données (QA, CTO)
create or replace function public.ai_health_checks()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Europe/Paris')::date;
  v_year integer := extract(isoyear from v_today)::integer;
  v_week integer := extract(week from v_today)::integer;
begin
  return jsonb_build_object(
    'today', v_today,
    'current_week', v_week,
    'current_week_meeting_exists', exists (select 1 from public.meetings where iso_year = v_year and iso_week = v_week),
    'meetings_total', (select count(*) from public.meetings),
    'meetings_past_still_in_preparation', (select count(*) from public.meetings where meeting_date < v_today and status = 'preparation'),
    'meetings_missing_submissions', (
      select count(*) from public.meetings m
      where (select count(*) from public.submissions s where s.meeting_id = m.id) < (select count(*) from public.services where active)
        and m.status in ('preparation', 'ready')),
    'services_active', (select count(*) from public.services where active),
    'services_without_manager', (select count(*) from public.services s where s.active and not exists (
      select 1 from public.profiles p where p.role = 'manager' and p.service_id = s.id)),
    'services_without_template', (select count(*) from public.services s where s.active and not exists (
      select 1 from public.slide_templates t where t.service_id = s.id)),
    'slides_without_submission', (select count(*) from public.slides sl where not exists (
      select 1 from public.submissions s where s.meeting_id = sl.meeting_id and s.service_id = sl.service_id)),
    'slides_empty_current_week', (
      select count(*) from public.slides sl join public.meetings m on m.id = sl.meeting_id
      where m.iso_year = v_year and m.iso_week = v_week and jsonb_array_length(sl.blocks) = 0 and not sl.hidden),
    'attachments_total', (select count(*) from public.attachments),
    'checked_at', now()
  );
end;
$$;

-- Vue d'ensemble de la base (CTO)
create or replace function public.ai_database_overview()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select jsonb_build_object(
    'tables', coalesce((
      select jsonb_agg(jsonb_build_object('table', c.relname, 'rows_estimate', greatest(c.reltuples, 0)::bigint,
        'size', pg_size_pretty(pg_total_relation_size(c.oid))) order by pg_total_relation_size(c.oid) desc)
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'), '[]'::jsonb),
    'database_size', pg_size_pretty(pg_database_size(current_database())),
    'storage_objects', (select count(*) from storage.objects),
    'postgres_version', current_setting('server_version')
  );
$$;

-- Statistiques d'usage (Data Analyst, CEO)
create or replace function public.ai_usage_stats(p_weeks integer default 8)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with recent as (
    select * from public.meetings
    where week_start >= (now() at time zone 'Europe/Paris')::date - (greatest(1, least(p_weeks, 52)) * 7)
  )
  select jsonb_build_object(
    'users_by_role', (select coalesce(jsonb_object_agg(role, n), '{}'::jsonb) from (select role, count(*) n from public.profiles group by role) r),
    'active_users_7d', (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
    'active_users_30d', (select count(*) from auth.users where last_sign_in_at > now() - interval '30 days'),
    'slides_edited_7d', (select count(*) from public.slides where updated_at > now() - interval '7 days'),
    'meetings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'week', m.iso_week, 'year', m.iso_year, 'date', m.meeting_date, 'status', m.status,
        'planned_minutes', (select coalesce(sum((v)::int), 0) from jsonb_each_text(m.durations) d(k, v)),
        'actual_seconds', (m.timing ->> 'totalSeconds')::int,
        'submissions', (select jsonb_object_agg(s.status, s.n) from (
          select status, count(*) n from public.submissions where meeting_id = m.id group by status) s),
        'submitted_late', (select count(*) from public.submissions s where s.meeting_id = m.id and s.submitted_at is not null
          and s.submitted_at > (m.meeting_date - 1 + time '17:00') at time zone 'Europe/Paris')
      ) order by m.week_start desc)
      from recent m), '[]'::jsonb),
    'support_requests', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (select status, count(*) n from public.support_requests group by status) s)
  );
$$;

revoke all on function public.ai_security_audit() from public, anon, authenticated;
revoke all on function public.ai_health_checks() from public, anon, authenticated;
revoke all on function public.ai_database_overview() from public, anon, authenticated;
revoke all on function public.ai_usage_stats(integer) from public, anon, authenticated;
grant execute on function public.ai_security_audit() to service_role;
grant execute on function public.ai_health_checks() to service_role;
grant execute on function public.ai_database_overview() to service_role;
grant execute on function public.ai_usage_stats(integer) to service_role;
grant execute on function public.create_meeting_for_week(integer, integer) to service_role;

-- -----------------------------------------------------------------------------
-- Temps réel
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['ai_agents', 'ai_missions', 'ai_messages', 'ai_decisions', 'ai_activity', 'ai_runs', 'ai_reports', 'support_requests'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Les sept agents
-- -----------------------------------------------------------------------------
insert into public.ai_agents (id, name, title, mission, personality, skills, objectives, tools, color, position, reports_to) values
('ceo', 'Claire', 'CEO',
 'Superviser l''organisation, fixer les priorités, répartir les missions entre les agents, arbitrer et rendre compte à la direction de NOVIA.',
 'Synthétique, orientée résultats, exigeante sur la clarté. Délègue plutôt que de tout faire elle-même.',
 array['Pilotage', 'Priorisation', 'Délégation', 'Arbitrage', 'Synthèse et reporting'],
 array['Chaque demande de la direction est transformée en missions assignées', 'Aucune mission critique sans responsable', 'Un rapport quotidien clair et factuel'],
 array['get_app_overview', 'get_usage_stats', 'list_agents', 'list_missions', 'get_mission', 'create_mission', 'update_mission', 'add_mission_note', 'send_message', 'record_decision', 'propose_action', 'write_report', 'read_activity', 'update_memory'],
 '#2C4F95', 0, null),
('cto', 'Hugo', 'CTO',
 'Garantir la qualité technique de l''application : architecture, maintenance, évolutions, performance et déploiement.',
 'Pragmatique et précis. Propose des solutions concrètes avec leurs risques.',
 array['Architecture React / TypeScript', 'Supabase et PostgreSQL', 'Déploiement Cloudflare Pages', 'Performance', 'Dette technique'],
 array['Zéro incident bloquant en production', 'Propositions d''évolution chiffrées et justifiées', 'Base de données saine'],
 array['run_health_checks', 'get_database_overview', 'get_meeting_status', 'list_agents', 'list_missions', 'get_mission', 'create_mission', 'update_mission', 'add_mission_note', 'send_message', 'record_decision', 'propose_action', 'write_report', 'read_activity', 'update_memory'],
 '#3E7CC4', 1, 'ceo'),
('rssi', 'Inès', 'RSSI',
 'Protéger l''application et ses données : audits de sécurité, règles d''accès (RLS), comptes et droits, surveillance.',
 'Rigoureuse et prudente. Signale les risques sans dramatiser, avec un niveau de gravité.',
 array['Audit de sécurité', 'Row Level Security', 'Gestion des accès', 'RGPD', 'Surveillance'],
 array['Toutes les tables protégées par RLS', 'Principe du moindre privilège pour les comptes', 'Audit hebdomadaire documenté'],
 array['run_security_audit', 'get_database_overview', 'list_agents', 'list_missions', 'get_mission', 'create_mission', 'update_mission', 'add_mission_note', 'send_message', 'record_decision', 'propose_action', 'write_report', 'read_activity', 'update_memory'],
 '#C0504D', 2, 'ceo'),
('ba', 'Lucas', 'Business Analyst',
 'Comprendre les besoins des services et de la direction, identifier les améliorations et les transformer en missions claires.',
 'À l''écoute, structuré, orienté utilisateur.',
 array['Analyse des besoins', 'Rédaction de user stories', 'Critères d''acceptation', 'Priorisation de la valeur'],
 array['Chaque besoin identifié devient une mission avec critères d''acceptation', 'Backlog priorisé'],
 array['get_app_overview', 'get_meeting_status', 'list_support_requests', 'list_agents', 'list_missions', 'get_mission', 'create_mission', 'update_mission', 'add_mission_note', 'send_message', 'record_decision', 'write_report', 'read_activity', 'update_memory'],
 '#6F8F2F', 3, 'ceo'),
('qa', 'Sarah', 'QA Engineer',
 'Tester les fonctionnalités, détecter les anomalies de données et de comportement, valider les corrections.',
 'Méthodique, factuelle, ne valide rien sans preuve.',
 array['Plans de test', 'Contrôles de cohérence', 'Reproduction d''anomalies', 'Validation des corrections'],
 array['Chaque correction validée par un contrôle', 'Anomalies documentées avec étapes de reproduction'],
 array['run_health_checks', 'get_meeting_status', 'list_agents', 'list_missions', 'get_mission', 'create_mission', 'update_mission', 'add_mission_note', 'send_message', 'record_decision', 'write_report', 'read_activity', 'update_memory'],
 '#7C55B0', 4, 'cto'),
('support', 'Nadia', 'Support Manager',
 'Traiter les demandes des utilisateurs, gérer les incidents, préparer des réponses claires et remonter les problèmes récurrents.',
 'Empathique, claire, rapide. Répond en langage simple.',
 array['Qualification des demandes', 'Gestion d''incidents', 'Rédaction de réponses', 'FAQ'],
 array['Chaque demande qualifiée sous 24 h', 'Réponses validées avant envoi', 'Problèmes récurrents remontés au BA'],
 array['list_support_requests', 'get_meeting_status', 'list_agents', 'list_missions', 'get_mission', 'create_mission', 'update_mission', 'add_mission_note', 'send_message', 'record_decision', 'propose_action', 'write_report', 'read_activity', 'update_memory'],
 '#D9702C', 5, 'ceo'),
('data', 'Yanis', 'Data Analyst',
 'Analyser les données, l''usage et les indicateurs de l''application et des réunions pour éclairer les décisions.',
 'Curieux, chiffré, prudent dans ses conclusions.',
 array['Analyse de données', 'Indicateurs de performance', 'Tendances', 'Visualisation'],
 array['Indicateurs hebdomadaires fiables', 'Alertes sur les dérives (retards, dépassements de temps)'],
 array['get_usage_stats', 'get_kpi_history', 'get_meeting_status', 'get_app_overview', 'list_agents', 'list_missions', 'get_mission', 'create_mission', 'update_mission', 'add_mission_note', 'send_message', 'record_decision', 'write_report', 'read_activity', 'update_memory'],
 '#229CD7', 6, 'ceo')
on conflict (id) do nothing;
