-- =============================================================================
-- NOVIA Flash Synchro — Stockage des fichiers
-- =============================================================================
--  attachments   (privé)  : pièces jointes, téléchargées via URL signée
--  slide-images  (public) : images insérées dans les diapositives
--                           (chemins aléatoires non devinables)
-- Chemin des objets : {meeting_id}/{service_id}/{fichier}
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 52428800)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('slide-images', 'slide-images', true, 10485760, array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'])
on conflict (id) do nothing;

-- Droit d'écriture déduit du chemin : réunion / service
create or replace function public.can_write_storage_path(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  parts text[] := string_to_array(p_name, '/');
begin
  if array_length(parts, 1) < 3 then
    return false;
  end if;
  return public.can_edit_service_content(parts[1]::uuid, parts[2]::uuid);
exception
  when invalid_text_representation then
    return false;
end;
$$;

create policy flash_attachments_read on storage.objects for select to authenticated
  using (bucket_id = 'attachments');
create policy flash_attachments_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and public.can_write_storage_path(name));
create policy flash_attachments_delete on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and public.can_write_storage_path(name));

create policy flash_images_read on storage.objects for select to authenticated
  using (bucket_id = 'slide-images');
create policy flash_images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'slide-images' and public.can_write_storage_path(name));
create policy flash_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'slide-images' and public.can_write_storage_path(name));
