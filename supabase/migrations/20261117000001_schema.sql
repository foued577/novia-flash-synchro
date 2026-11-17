-- =============================================================================
-- NOVIA Flash Synchro — Schéma de données
-- =============================================================================
-- Une réunion (meetings) par semaine ISO. Pour chaque service participant :
-- un statut de saisie (submissions) et des diapositives (slides) dont le
-- contenu est stocké en JSON (blocs : indicateurs, listes, tableaux, graphiques…).
-- =============================================================================

create type public.app_role as enum ('admin', 'manager', 'viewer');
create type public.submission_status as enum ('draft', 'in_progress', 'submitted', 'validated');
create type public.meeting_status as enum ('preparation', 'ready', 'held', 'archived');
create type public.slide_kind as enum ('overview', 'achievements', 'forecast', 'news', 'custom');

-- -----------------------------------------------------------------------------
-- Paramètres généraux (ligne unique)
-- -----------------------------------------------------------------------------
create table public.app_settings (
  id smallint primary key default 1 check (id = 1),
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Services et profils
-- -----------------------------------------------------------------------------
create table public.services (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  short_name text not null,
  palette jsonb not null,
  icon text not null default 'sparkles',
  duration_minutes integer not null default 5 check (duration_minutes between 1 and 120),
  position integer not null default 0,
  active boolean not null default true,
  manager_id uuid,
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  email text not null default '',
  role public.app_role not null default 'viewer',
  service_id uuid references public.services (id) on delete set null,
  job_title text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.services
  add constraint services_manager_id_fkey foreign key (manager_id) references public.profiles (id) on delete set null;

-- Structure par défaut des diapositives de chaque service
create table public.slide_templates (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services (id) on delete cascade,
  kind public.slide_kind not null,
  title text not null default '',
  position integer not null default 0,
  blocks jsonb not null default '[]'::jsonb
);

-- -----------------------------------------------------------------------------
-- Réunions
-- -----------------------------------------------------------------------------
create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  iso_year integer not null,
  iso_week integer not null check (iso_week between 1 and 53),
  week_start date not null,
  week_end date not null,
  review_weeks integer not null default 1 check (review_weeks between 1 and 4),
  forecast_reference text not null default 'next' check (forecast_reference in ('next', 'current')),
  meeting_date date not null,
  meeting_time time not null default '10:00',
  status public.meeting_status not null default 'preparation',
  title text,
  notes text not null default '',
  durations jsonb not null default '{}'::jsonb,
  participants uuid[] not null default '{}',
  duplicated_from uuid references public.meetings (id) on delete set null,
  timing jsonb,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meetings_week_unique unique (iso_year, iso_week),
  constraint meetings_week_consistency check (week_end = week_start + 6 and extract(isodow from week_start) = 1)
);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  status public.submission_status not null default 'draft',
  comment text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  submitted_at timestamptz,
  validated_at timestamptz,
  validated_by uuid references public.profiles (id) on delete set null,
  constraint submissions_unique unique (meeting_id, service_id)
);

create table public.slides (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  kind public.slide_kind not null default 'custom',
  title text not null default '',
  subtitle text not null default '',
  position integer not null default 0,
  hidden boolean not null default false,
  blocks jsonb not null default '[]'::jsonb,
  notes text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  file_name text not null,
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null default 0,
  storage_path text not null unique,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Index
-- -----------------------------------------------------------------------------
create index meetings_date_idx on public.meetings (meeting_date desc);
create index submissions_meeting_idx on public.submissions (meeting_id);
create index slides_meeting_service_idx on public.slides (meeting_id, service_id, position);
create index attachments_meeting_idx on public.attachments (meeting_id, service_id);
create index slide_templates_service_idx on public.slide_templates (service_id, position);
create index profiles_service_idx on public.profiles (service_id);

-- -----------------------------------------------------------------------------
-- Horodatage automatique
-- -----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger app_settings_touch before update on public.app_settings for each row execute function public.touch_updated_at();
create trigger services_touch before update on public.services for each row execute function public.touch_updated_at();
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger meetings_touch before update on public.meetings for each row execute function public.touch_updated_at();
create trigger slides_touch before update on public.slides for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Temps réel : diffusion des modifications (éditeur ↔ présentation)
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.meetings, public.submissions, public.slides, public.attachments;
  end if;
end;
$$;
