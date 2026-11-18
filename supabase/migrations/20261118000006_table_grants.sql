-- =============================================================================
-- NOVIA Flash Synchro — Droits de base des comptes connectés
-- Les projets Supabase récents n'accordent plus automatiquement SELECT/INSERT/
-- UPDATE/DELETE aux rôles « authenticated » et « service_role » (fonction Edge admin-users) sur les tables créées en SQL.
-- Sans ces droits : « permission denied » (42501) dès le chargement du profil.
-- Les règles RLS restent seules juges de ce que chacun peut voir ou modifier.
-- =============================================================================

grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on
  public.app_settings, public.services, public.profiles, public.slide_templates,
  public.meetings, public.submissions, public.slides, public.attachments
to authenticated, service_role;
