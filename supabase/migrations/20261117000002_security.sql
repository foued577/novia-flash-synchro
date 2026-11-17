-- =============================================================================
-- NOVIA Flash Synchro — Sécurité (RLS) et règles de gestion
-- =============================================================================
--  Administrateur  : accès complet (réunions, validation, paramètres, rôles)
--  Responsable     : lit tout, modifie le contenu de SON service tant qu'il
--                    n'est pas soumis/validé, soumet ou retire sa soumission
--  Collaborateur   : consultation seule
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Fonctions d'aide (security definer : lisent les profils sans boucle RLS)
-- -----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.manages_service(p_service uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'manager' and service_id = p_service);
$$;

create or replace function public.can_edit_service_content(p_meeting uuid, p_service uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
    or (
      public.manages_service(p_service)
      and coalesce(
        (select status from public.submissions where meeting_id = p_meeting and service_id = p_service),
        'draft'
      ) in ('draft', 'in_progress')
    );
$$;

-- -----------------------------------------------------------------------------
-- Activation de la sécurité au niveau des lignes
-- -----------------------------------------------------------------------------
alter table public.app_settings enable row level security;
alter table public.services enable row level security;
alter table public.profiles enable row level security;
alter table public.slide_templates enable row level security;
alter table public.meetings enable row level security;
alter table public.submissions enable row level security;
alter table public.slides enable row level security;
alter table public.attachments enable row level security;

-- Paramètres, services, modèles : lecture pour tous les connectés, écriture admin
create policy settings_read on public.app_settings for select to authenticated using (true);
create policy settings_admin on public.app_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy services_read on public.services for select to authenticated using (true);
create policy services_admin on public.services for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy templates_read on public.slide_templates for select to authenticated using (true);
create policy templates_admin on public.slide_templates for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Profils : chacun lit l'annuaire ; mise à jour de son propre profil ou par l'admin
create policy profiles_read on public.profiles for select to authenticated using (true);
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());
create policy profiles_admin_delete on public.profiles for delete to authenticated using (public.is_admin());

-- Réunions : lecture pour tous, gestion par l'administrateur
create policy meetings_read on public.meetings for select to authenticated using (true);
create policy meetings_admin on public.meetings for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Statuts de saisie
create policy submissions_read on public.submissions for select to authenticated using (true);
create policy submissions_admin on public.submissions for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy submissions_manager_update on public.submissions for update to authenticated
  using (public.manages_service(service_id))
  with check (public.manages_service(service_id));

-- Diapositives : modifiables par l'admin, ou par le responsable tant que non soumis
create policy slides_read on public.slides for select to authenticated using (true);
create policy slides_insert on public.slides for insert to authenticated with check (public.can_edit_service_content(meeting_id, service_id));
create policy slides_update on public.slides for update to authenticated
  using (public.can_edit_service_content(meeting_id, service_id))
  with check (public.can_edit_service_content(meeting_id, service_id));
create policy slides_delete on public.slides for delete to authenticated using (public.can_edit_service_content(meeting_id, service_id));

-- Pièces jointes : mêmes règles que les diapositives
create policy attachments_read on public.attachments for select to authenticated using (true);
create policy attachments_insert on public.attachments for insert to authenticated with check (public.can_edit_service_content(meeting_id, service_id));
create policy attachments_delete on public.attachments for delete to authenticated using (public.can_edit_service_content(meeting_id, service_id));

-- -----------------------------------------------------------------------------
-- Règles de gestion non exprimables en RLS
-- -----------------------------------------------------------------------------

-- Un non-administrateur ne change ni son rôle, ni son service, ni son e-mail.
create or replace function public.guard_profile_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.role is distinct from old.role or new.service_id is distinct from old.service_id or new.email is distinct from old.email then
      raise exception 'Seul un administrateur peut modifier le rôle, le service ou l’e-mail.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_guard before update on public.profiles for each row execute function public.guard_profile_update();

-- Circuit Brouillon → En cours → Soumis → Validé : seul l'admin valide ou rouvre.
create or replace function public.guard_submission_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.meeting_id is distinct from old.meeting_id or new.service_id is distinct from old.service_id then
    raise exception 'Le service et la réunion d’un statut ne peuvent pas être modifiés.' using errcode = '42501';
  end if;

  if auth.uid() is not null and not public.is_admin() then
    if new.status = 'validated' and old.status <> 'validated' then
      raise exception 'Seul un administrateur peut valider un contenu.' using errcode = '42501';
    end if;
    if old.status = 'validated' and new.status <> 'validated' then
      raise exception 'Contenu validé : seul un administrateur peut le rouvrir.' using errcode = '42501';
    end if;
    -- Le commentaire et les champs de validation appartiennent à l'administrateur.
    new.comment := old.comment;
    new.validated_at := old.validated_at;
    new.validated_by := old.validated_by;
  end if;

  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  if new.status = 'submitted' and old.status is distinct from 'submitted' then
    new.submitted_at := now();
  end if;
  if new.status = 'validated' and old.status is distinct from 'validated' then
    new.validated_at := now();
    new.validated_by := coalesce(auth.uid(), new.validated_by);
  end if;
  return new;
end;
$$;

create trigger submissions_guard before update on public.submissions for each row execute function public.guard_submission_update();

-- Trace de l'auteur des modifications de diapositives
create or replace function public.stamp_slide_author()
returns trigger
language plpgsql
as $$
begin
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

create trigger slides_author before insert or update on public.slides for each row execute function public.stamp_slide_author();

-- -----------------------------------------------------------------------------
-- Création automatique du profil à l'inscription / invitation
-- Le tout premier compte devient administrateur ; les suivants « collaborateur ».
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)),
    case when exists (select 1 from public.profiles) then 'viewer'::public.app_role else 'admin'::public.app_role end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
