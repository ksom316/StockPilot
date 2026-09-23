-- StockPilot Phase 13: deterministic in-app notifications.

create type public.notification_type as enum (
  'low_stock',
  'out_of_stock',
  'opportunity_attention',
  'invitation_available',
  'membership_status_changed'
);

create type public.notification_severity as enum ('info', 'warning', 'critical');

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  recipient_user_id uuid not null references public.profiles (id) on delete cascade,
  notification_type public.notification_type not null,
  title text not null check (length(btrim(title)) between 1 and 160),
  message text not null check (length(btrim(message)) between 1 and 500),
  severity public.notification_severity not null default 'info',
  entity_type text check (entity_type is null or entity_type in ('product', 'opportunity', 'invitation', 'membership')),
  entity_id uuid,
  dedupe_key text not null check (length(btrim(dedupe_key)) between 1 and 240),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  condition_active boolean not null default true,
  constraint notifications_entity_pair_check check ((entity_type is null) = (entity_id is null)),
  constraint notifications_dedupe_key_unique unique (business_id, recipient_user_id, dedupe_key)
);

create index notifications_recipient_created_idx
  on public.notifications (recipient_user_id, business_id, created_at desc);

alter table public.notifications enable row level security;
revoke all on table public.notifications from public, anon, authenticated;
grant select on table public.notifications to authenticated;

create policy notifications_select_recipient_active_member
on public.notifications
for select
to authenticated
using (
  recipient_user_id = (select auth.uid())
  and (select private.is_active_business_member(business_id))
);

create or replace function private.sync_product_stock_notifications(
  p_business_id uuid,
  p_product_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products%rowtype;
  v_type public.notification_type;
  v_title text;
  v_message text;
  v_severity public.notification_severity;
begin
  select * into v_product
  from public.products
  where business_id = p_business_id and id = p_product_id;

  if not found or not v_product.is_active then
    update public.notifications
    set read_at = coalesce(read_at, now()), condition_active = false
    where business_id = p_business_id
      and entity_type = 'product'
      and entity_id = p_product_id
      and notification_type in ('low_stock', 'out_of_stock');
    return;
  end if;

  if v_product.current_quantity = 0 then
    v_type := 'out_of_stock';
    v_title := 'Product is out of stock';
    v_message := format('%s has no remaining stock.', v_product.name);
    v_severity := 'critical';
  elsif v_product.low_stock_threshold > 0 and v_product.current_quantity <= v_product.low_stock_threshold then
    v_type := 'low_stock';
    v_title := 'Product is low in stock';
    v_message := format('%s is at or below its low-stock threshold.', v_product.name);
    v_severity := 'warning';
  else
    update public.notifications
    set read_at = coalesce(read_at, now()), condition_active = false
    where business_id = p_business_id
      and entity_type = 'product'
      and entity_id = p_product_id
      and notification_type in ('low_stock', 'out_of_stock');
    return;
  end if;

  update public.notifications
  set read_at = coalesce(read_at, now())
  where business_id = p_business_id
    and entity_type = 'product'
    and entity_id = p_product_id
    and notification_type in ('low_stock', 'out_of_stock')
    and notification_type <> v_type;

  insert into public.notifications (
    business_id, recipient_user_id, notification_type, title, message,
    severity, entity_type, entity_id, dedupe_key, read_at
  )
  select p_business_id, member.user_id, v_type, v_title, v_message,
    v_severity, 'product', p_product_id, v_type::text || ':' || p_product_id::text, null
  from public.business_members as member
  where member.business_id = p_business_id and member.status = 'active'
  on conflict (business_id, recipient_user_id, dedupe_key) do update
    set title = excluded.title,
        message = excluded.message,
        severity = excluded.severity,
        created_at = now(),
        read_at = case when notifications.condition_active then notifications.read_at else null end,
        condition_active = true;
end;
$$;

revoke all on function private.sync_product_stock_notifications(uuid, uuid) from public, anon, authenticated;

create or replace function private.sync_business_notifications(p_business_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_is_active boolean;
  v_team_enabled boolean;
  v_opportunities_enabled boolean;
  v_role public.business_role;
  v_snapshot jsonb;
  v_signal jsonb;
  v_signal_key text;
begin
  if v_user_id is null then
    raise exception 'Business is unavailable' using errcode = '42501';
  end if;

  select lower(email) into v_email from auth.users where id = v_user_id;
  v_is_active := private.is_active_business_member(p_business_id);
  if not v_is_active and not exists (
    select 1 from public.team_invitations as invitation
    where invitation.business_id = p_business_id
      and invitation.email = v_email
      and invitation.status = 'pending'
      and invitation.expires_at > now()
  ) then
    raise exception 'Business is unavailable' using errcode = '42501';
  end if;

  if v_is_active then
    for v_signal in
      select jsonb_build_object('id', product.id)
      from public.products as product
      where product.business_id = p_business_id
    loop
      perform private.sync_product_stock_notifications(p_business_id, (v_signal->>'id')::uuid);
    end loop;
  end if;

  select coalesce(bool_or(module.enabled) filter (where module.module = 'team'), false),
    coalesce(bool_or(module.enabled) filter (where module.module = 'smart_insights'), false)
  into v_team_enabled, v_opportunities_enabled
  from public.business_modules as module
  where module.business_id = p_business_id;

  if v_team_enabled and v_email is not null then
    insert into public.notifications (
      business_id, recipient_user_id, notification_type, title, message,
      severity, entity_type, entity_id, dedupe_key
    )
    select invitation.business_id, v_user_id, 'invitation_available',
      'You have a team invitation',
      format('You have a pending invitation to join %s.', business.name),
      'info', 'invitation', invitation.id, 'invitation:' || invitation.id::text
    from public.team_invitations as invitation
    join public.businesses as business on business.id = invitation.business_id
    where invitation.business_id = p_business_id
      and invitation.email = v_email
      and invitation.status = 'pending'
      and invitation.expires_at > now()
    on conflict (business_id, recipient_user_id, dedupe_key) do update
      set message = excluded.message, created_at = now(), read_at = notifications.read_at;

    update public.notifications as notification
    set read_at = coalesce(notification.read_at, now())
    where notification.business_id = p_business_id
      and notification.recipient_user_id = v_user_id
      and notification.notification_type = 'invitation_available'
      and not exists (
        select 1 from public.team_invitations as invitation
        where invitation.id = notification.entity_id
          and invitation.email = v_email
          and invitation.status = 'pending'
          and invitation.expires_at > now()
      );
  end if;

  v_role := private.active_business_role(p_business_id);
  if v_is_active and v_opportunities_enabled and v_role in ('owner', 'manager') then
    v_snapshot := public.get_business_opportunities(p_business_id, 100);
    for v_signal in select value from jsonb_array_elements(v_snapshot->'signals') as item(value)
    loop
      v_signal_key := 'opportunity:' || (v_signal->>'signalId');
      insert into public.notifications (
        business_id, recipient_user_id, notification_type, title, message,
        severity, entity_type, entity_id, dedupe_key
      )
      select p_business_id, member.user_id, 'opportunity_attention',
        'Business opportunity identified',
        left(coalesce(v_signal->>'summary', v_signal->>'title', 'Review a deterministic business opportunity.'), 500),
        case when v_signal->>'priority' = 'HIGH' then 'warning'::public.notification_severity else 'info'::public.notification_severity end,
        'opportunity', (v_signal->'product'->>'id')::uuid, v_signal_key
      from public.business_members as member
      where member.business_id = p_business_id
        and member.status = 'active'
        and member.role in ('owner', 'manager')
      on conflict (business_id, recipient_user_id, dedupe_key) do update
        set title = excluded.title, message = excluded.message,
            severity = excluded.severity, created_at = now(), read_at = notifications.read_at;
    end loop;
  end if;
end;
$$;

revoke all on function private.sync_business_notifications(uuid) from public, anon, authenticated;

create or replace function private.products_sync_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.sync_product_stock_notifications(new.business_id, new.id);
  return new;
end;
$$;

create trigger products_sync_notifications
after insert or update of current_quantity, low_stock_threshold, is_active on public.products
for each row execute function private.products_sync_notifications();

create function public.get_notifications(p_business_id uuid, p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'Notification limit must be between 1 and 100' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.business_members as member
    where member.business_id = p_business_id and member.user_id = auth.uid() and member.status = 'active'
  ) and not exists (
    select 1 from public.team_invitations as invitation
    join auth.users as auth_user on auth_user.id = auth.uid()
    where invitation.business_id = p_business_id
      and invitation.email = lower(auth_user.email)
      and invitation.status = 'pending'
      and invitation.expires_at > now()
  ) then
    raise exception 'Business is unavailable' using errcode = '42501';
  end if;
  perform private.sync_business_notifications(p_business_id);
  return coalesce((select jsonb_agg(row_to_json(notification) order by notification.created_at desc)
    from (
      select id, business_id, recipient_user_id, notification_type, title, message,
        severity, entity_type, entity_id, created_at, read_at
      from public.notifications
      where business_id = p_business_id and recipient_user_id = auth.uid()
      order by created_at desc
      limit p_limit
    ) as notification), '[]'::jsonb);
end;
$$;

create function public.mark_notification_read(p_notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notifications
  set read_at = coalesce(read_at, now())
  where id = p_notification_id
    and recipient_user_id = auth.uid()
    and (
      private.is_active_business_member(business_id)
      or exists (
        select 1
        from public.team_invitations as invitation
        join auth.users as auth_user on auth_user.id = auth.uid()
        where invitation.id = notifications.entity_id
          and notifications.notification_type = 'invitation_available'
          and invitation.email = lower(auth_user.email)
          and invitation.status = 'pending'
          and invitation.expires_at > now()
      )
    );
  return found;
end;
$$;

create function public.mark_all_notifications_read(p_business_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  if not private.is_active_business_member(p_business_id) then
    raise exception 'Business is unavailable' using errcode = '42501';
  end if;
  update public.notifications
  set read_at = coalesce(read_at, now())
  where business_id = p_business_id and recipient_user_id = auth.uid() and read_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.get_notifications(uuid, integer) from public, anon, authenticated;
revoke all on function public.mark_notification_read(uuid) from public, anon, authenticated;
revoke all on function public.mark_all_notifications_read(uuid) from public, anon, authenticated;
grant execute on function public.get_notifications(uuid, integer) to authenticated;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_notifications_read(uuid) to authenticated;

comment on table public.notifications is 'Deterministic, business-scoped in-app notifications. Client roles can only read their own active-member notifications.';
