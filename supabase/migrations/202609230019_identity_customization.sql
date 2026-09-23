alter table public.profiles
  add column avatar_id text not null default 'user'
  check (avatar_id in ('user', 'sun', 'leaf', 'sparkles', 'briefcase'));

alter table public.businesses
  add column icon_id text not null default 'store'
  check (icon_id in ('store', 'building', 'warehouse', 'landmark', 'shopping-bag'));

grant update (display_name, avatar_id) on table public.profiles to authenticated;
grant update (name, business_type, currency, icon_id) on table public.businesses to authenticated;
