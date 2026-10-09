-- Run in a NEW project's SQL Editor after creating the PRIVATE "gallery" bucket.
-- Each user can read and upload only inside their own user-ID folder.
-- These policies grant no anonymous access and no overwrite/delete privileges.
-- Re-running replaces only these two named policies, not other project policies.
begin;
drop policy if exists "gallery_read_own" on storage.objects;
drop policy if exists "gallery_upload_own" on storage.objects;

create policy "gallery_read_own"
on storage.objects for select to authenticated
using (
  bucket_id = 'gallery'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "gallery_upload_own"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'gallery'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
commit;
