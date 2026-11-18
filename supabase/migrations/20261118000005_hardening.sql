-- =============================================================================
-- NOVIA Flash Synchro — Durcissement (recommandations du Security Advisor)
-- * search_path figé sur les fonctions utilitaires
-- * aucune fonction exécutable par les visiteurs non connectés (anon)
-- * fonctions de déclencheur non appelables via l'API
-- Toutes les règles RLS ciblent « authenticated » : rien ne change pour l'application.
-- =============================================================================

alter function public.touch_updated_at() set search_path = public;
alter function public.stamp_slide_author() set search_path = public;
alter function public.iso_week_start(integer, integer) set search_path = public;
alter function public.carry_blocks(jsonb) set search_path = public;

-- Visiteurs non connectés : aucun accès aux fonctions
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.manages_service(uuid) from public, anon;
revoke execute on function public.can_edit_service_content(uuid, uuid) from public, anon;
revoke execute on function public.can_write_storage_path(text) from public, anon;
revoke execute on function public.ensure_meeting_for_week(integer, integer) from public, anon;

-- Fonctions utilisées par les règles RLS et l'application : réservées aux comptes connectés
grant execute on function public.is_admin() to authenticated;
grant execute on function public.manages_service(uuid) to authenticated;
grant execute on function public.can_edit_service_content(uuid, uuid) to authenticated;
grant execute on function public.can_write_storage_path(text) to authenticated;
grant execute on function public.ensure_meeting_for_week(integer, integer) to authenticated;

-- Fonctions de déclencheur : jamais appelées directement
revoke execute on function public.guard_profile_update() from public, anon, authenticated;
revoke execute on function public.guard_submission_update() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
