-- StockPilot branding media: public identity images with authenticated writes.
-- The object names are opaque UUID-versioned paths. Database metadata stores
-- only the current object path; image bytes remain in Supabase Storage.

alter table public.profiles
  add column avatar_path text,
  add constraint profiles_avatar_path_check
    check (
      avatar_path is null
      or avatar_path ~ ('^profiles/' || id::text || '/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$')
    );

alter table public.businesses
  add column logo_path text,
  add constraint businesses_logo_path_check
    check (
      logo_path is null
      or logo_path ~ ('^businesses/' || id::text || '/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$')
    );

grant update (avatar_path) on table public.profiles to authenticated;
grant update (logo_path) on table public.businesses to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'branding',
  'branding',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy branding_objects_public_read
on storage.objects
for select
to public
using (bucket_id = 'branding');

create policy branding_objects_insert_own_scope
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'branding'
  and (
    name ~ ('^profiles/' || (select auth.uid())::text || '/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$')
    or (
      name ~ '^businesses/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
      and private.is_business_owner(
        case
          when split_part(name, '/', 2) ~ '^[0-9a-f-]{36}$' then split_part(name, '/', 2)::uuid
          else null
        end
      )
    )
  )
);

create policy branding_objects_update_own_scope
on storage.objects
for update
to authenticated
using (
  bucket_id = 'branding'
  and (
    name ~ ('^profiles/' || (select auth.uid())::text || '/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$')
    or (
      name ~ '^businesses/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
      and private.is_business_owner(
        case
          when split_part(name, '/', 2) ~ '^[0-9a-f-]{36}$' then split_part(name, '/', 2)::uuid
          else null
        end
      )
    )
  )
)
with check (
  bucket_id = 'branding'
  and (
    name ~ ('^profiles/' || (select auth.uid())::text || '/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$')
    or (
      name ~ '^businesses/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
      and private.is_business_owner(
        case
          when split_part(name, '/', 2) ~ '^[0-9a-f-]{36}$' then split_part(name, '/', 2)::uuid
          else null
        end
      )
    )
  )
);

create policy branding_objects_delete_own_scope
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'branding'
  and (
    name ~ ('^profiles/' || (select auth.uid())::text || '/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$')
    or (
      name ~ '^businesses/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
      and private.is_business_owner(
        case
          when split_part(name, '/', 2) ~ '^[0-9a-f-]{36}$' then split_part(name, '/', 2)::uuid
          else null
        end
      )
    )
  )
);

comment on column public.profiles.avatar_path is
  'Current versioned object path in the public-read branding bucket; image bytes are not stored in PostgreSQL.';

comment on column public.businesses.logo_path is
  'Current versioned object path in the public-read branding bucket; image bytes are not stored in PostgreSQL.';
