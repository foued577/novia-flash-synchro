-- =============================================================================
-- NOVIA Flash Synchro — AI Company : travail planifié
-- Un jeton interne (jamais exposé au navigateur) authentifie les appels de
-- pg_cron vers l'orchestrateur : aucun secret à saisir à la main.
--   * cycle de travail : toutes les heures, du lundi au vendredi, 8 h-19 h (Paris)
--     → ne consomme rien s'il n'y a ni mission prête ni message en attente ;
--   * rapport quotidien : du lundi au vendredi vers 18 h (Paris)
--     → ignoré s'il n'y a eu aucune activité dans la journée.
-- Désactivable depuis l'application (AI Company → Paramètres IA).
-- =============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

alter table public.ai_settings add column if not exists scheduled boolean not null default true;

-- Jeton interne : lisible uniquement par le serveur (aucune règle RLS = aucun accès client)
create table if not exists public.ai_private (
  id integer primary key default 1 check (id = 1),
  cron_token text not null default encode(gen_random_bytes(32), 'hex')
);
insert into public.ai_private (id) values (1) on conflict (id) do nothing;
alter table public.ai_private enable row level security;
revoke all on public.ai_private from public, anon, authenticated;
grant select on public.ai_private to service_role;

-- Appel de l'orchestrateur depuis la base
create or replace function public.ai_cron_call(p_action text)
returns bigint
language sql
security definer
set search_path = public
as $$
  select net.http_post(
    url := 'https://mbdzzjfamjaabqqllijz.supabase.co/functions/v1/ai-company',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-ai-cron-secret', (select cron_token from public.ai_private where id = 1)),
    body := jsonb_build_object('action', p_action),
    timeout_milliseconds := 10000
  );
$$;
revoke all on function public.ai_cron_call(text) from public, anon, authenticated;

-- Horaires en UTC (heure de Paris − 1 h l'hiver, − 2 h l'été)
select cron.unschedule(jobid) from cron.job where jobname in ('ai-company-cycle', 'ai-company-report');
select cron.schedule('ai-company-cycle', '10 7-18 * * 1-5', $$ select public.ai_cron_call('run_cycle') $$);
select cron.schedule('ai-company-report', '0 17 * * 1-5', $$ select public.ai_cron_call('daily_report') $$);
