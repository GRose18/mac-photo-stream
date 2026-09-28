create table public.photos (
    id bigint generated always as identity primary key,
    object_path text not null unique,
    content_type text not null,
    size_bytes bigint not null check (size_bytes > 0),
    uploaded_at timestamptz not null default now(),
    captured_at timestamptz
);
alter table public.photos enable row level security;
revoke all on public.photos from anon, authenticated;
grant select, insert, delete on public.photos to service_role;
grant usage, select on sequence public.photos_id_seq to service_role;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photo-stream', 'photo-stream', false, 6291456, array['image/jpeg','image/png','image/webp']);
