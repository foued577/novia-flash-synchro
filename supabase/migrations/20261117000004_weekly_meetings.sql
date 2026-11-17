-- =============================================================================
-- NOVIA Flash Synchro — Semaines ISO et création automatique des réunions
-- =============================================================================

-- Lundi de la semaine ISO (le 4 janvier appartient toujours à la semaine 1)
create or replace function public.iso_week_start(p_year integer, p_week integer)
returns date
language sql
immutable
as $$
  select (date_trunc('week', make_date(p_year, 1, 4)::timestamp) + make_interval(weeks => p_week - 1))::date;
$$;

-- Copie des blocs avec de nouveaux identifiants ; la valeur d'un indicateur
-- devient son « rappel » (situation précédente) dans la nouvelle semaine.
create or replace function public.carry_blocks(p_blocks jsonb)
returns jsonb
language sql
volatile
as $$
  select coalesce(
    jsonb_agg(
      case
        when b ->> 'type' = 'kpis' then
          jsonb_set(
            b || jsonb_build_object('id', gen_random_uuid()),
            '{items}',
            coalesce(
              (
                select jsonb_agg(
                  i || jsonb_build_object(
                    'id', gen_random_uuid(),
                    'previous', case when coalesce(i ->> 'value', '') <> '' then i ->> 'value' else coalesce(i ->> 'previous', '') end
                  )
                  order by n
                )
                from jsonb_array_elements(b -> 'items') with ordinality as it(i, n)
              ),
              '[]'::jsonb
            )
          )
        when jsonb_typeof(b -> 'items') = 'array' then
          jsonb_set(
            b || jsonb_build_object('id', gen_random_uuid()),
            '{items}',
            coalesce(
              (select jsonb_agg(i || jsonb_build_object('id', gen_random_uuid()) order by n) from jsonb_array_elements(b -> 'items') with ordinality as it(i, n)),
              '[]'::jsonb
            )
          )
        else b || jsonb_build_object('id', gen_random_uuid())
      end
      order by ord
    ),
    '[]'::jsonb
  )
  from jsonb_array_elements(coalesce(p_blocks, '[]'::jsonb)) with ordinality as t(b, ord);
$$;

-- Création de la réunion d'une semaine (interne : sans contrôle d'identité).
-- Reprend le contenu de la dernière réunion, à défaut les modèles de diapositives.
create or replace function public.create_meeting_for_week(p_year integer, p_week integer)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_source uuid;
  v_settings jsonb;
  v_start date := public.iso_week_start(p_year, p_week);
  v_weekday integer;
  v_time time;
  v_forecast text;
begin
  select id into v_id from public.meetings where iso_year = p_year and iso_week = p_week;
  if v_id is not null then
    return v_id;
  end if;

  select settings into v_settings from public.app_settings where id = 1;
  v_weekday := least(7, greatest(1, coalesce((v_settings ->> 'meetingWeekday')::integer, 4)));
  v_time := coalesce((v_settings ->> 'meetingTime')::time, '10:00');
  v_forecast := coalesce(v_settings ->> 'forecastReference', 'next');

  select id into v_source from public.meetings where week_start < v_start order by week_start desc limit 1;

  insert into public.meetings (iso_year, iso_week, week_start, week_end, review_weeks, forecast_reference, meeting_date, meeting_time, status, durations, participants, duplicated_from)
  select
    p_year, p_week, v_start, v_start + 6, 1, v_forecast, v_start + (v_weekday - 1), v_time, 'preparation',
    coalesce(jsonb_object_agg(s.id::text, s.duration_minutes) filter (where s.id is not null), '{}'::jsonb),
    coalesce(array_agg(s.id order by s.position) filter (where s.id is not null), '{}'),
    v_source
  from public.services s
  where s.active
  returning id into v_id;

  insert into public.submissions (meeting_id, service_id)
  select v_id, s.id from public.services s where s.active;

  if v_source is not null then
    insert into public.slides (meeting_id, service_id, kind, title, subtitle, position, hidden, blocks, notes)
    select v_id, sl.service_id, sl.kind, sl.title, '', sl.position, sl.hidden, public.carry_blocks(sl.blocks), ''
    from public.slides sl
    join public.services s on s.id = sl.service_id and s.active
    where sl.meeting_id = v_source;
  end if;

  insert into public.slides (meeting_id, service_id, kind, title, position, blocks)
  select v_id, t.service_id, t.kind, t.title, t.position, public.carry_blocks(t.blocks)
  from public.slide_templates t
  join public.services s on s.id = t.service_id and s.active
  where not exists (select 1 from public.slides x where x.meeting_id = v_id and x.service_id = t.service_id);

  return v_id;
end;
$$;

-- Appel depuis l'application (tout utilisateur connecté peut déclencher la création).
create or replace function public.ensure_meeting_for_week(p_year integer, p_week integer)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentification requise' using errcode = '42501';
  end if;
  if p_week < 1 or p_week > 53 then
    raise exception 'Semaine ISO invalide' using errcode = '22023';
  end if;
  return public.create_meeting_for_week(p_year, p_week);
end;
$$;

-- Variante datée (fuseau Europe/Paris), utilisée par la tâche planifiée.
create or replace function public.create_meeting_for_date(p_date date)
returns uuid
language sql
security definer
set search_path = public
as $$
  select public.create_meeting_for_week(extract(isoyear from p_date)::integer, extract(week from p_date)::integer);
$$;

revoke all on function public.create_meeting_for_week(integer, integer) from public;
revoke all on function public.create_meeting_for_date(date) from public;
revoke all on function public.ensure_meeting_for_week(integer, integer) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.ensure_meeting_for_week(integer, integer) to authenticated';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Optionnel : création chaque lundi à 6 h (heure de Paris) avec l'extension pg_cron
-- (Dashboard Supabase → Database → Extensions → pg_cron), puis exécuter :
--
--   select cron.schedule(
--     'flash-synchro-hebdomadaire',
--     '0 5 * * 1',
--     $cron$ select public.create_meeting_for_date((now() at time zone 'Europe/Paris')::date) $cron$
--   );
-- -----------------------------------------------------------------------------
