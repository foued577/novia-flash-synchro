-- =============================================================================
-- NOVIA Flash Synchro — Suppression du jeu de démonstration
-- À exécuter UNE FOIS dans Supabase (SQL Editor) si demo-data.sql a été chargé,
-- avant la mise en service réelle. Supprime uniquement les 7 réunions fictives
-- (et, en cascade, leurs remises, diapositives et pièces jointes en base).
-- Services, modèles de diapositives, paramètres et utilisateurs sont conservés.
-- =============================================================================

delete from public.meetings
where id in (
  '065475f2-527d-4340-add4-5b1a11d23540',
  'ec165b0e-5bf9-4847-96b2-8bdf4bd90bc5',
  '749a4784-1eaa-4176-8237-85e4ac4db5f5',
  '7b955124-506c-4752-94d7-bf1101027b69',
  'fcd1a72c-7358-4752-b4e5-fd8ea85100fd',
  '52676959-72b9-4bff-8d3d-37e36724c90c',
  '37a1598b-fb5a-48cf-b832-cd940b8e02f0'
);

-- Vérification : nombre de réunions restantes
select count(*) as reunions_restantes from public.meetings;
