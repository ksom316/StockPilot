-- Phase 14B usability closure: constrained business currency and optional product SKU.
alter table public.businesses
  add constraint businesses_supported_currency_check
  check (currency in ('GHS', 'USD', 'EUR', 'GBP', 'NGN', 'ZAR'));

alter table public.products alter column sku drop not null;
alter table public.products drop constraint if exists products_sku_check;
alter table public.products add constraint products_sku_check check (sku is null or length(btrim(sku)) between 1 and 100);
alter table public.sale_items alter column product_sku drop not null;
alter table public.sale_items drop constraint if exists sale_items_product_sku_check;
alter table public.sale_items add constraint sale_items_product_sku_check check (product_sku is null or length(btrim(product_sku)) between 1 and 100);
alter table public.purchase_items alter column product_sku drop not null;
alter table public.purchase_items drop constraint if exists purchase_items_product_sku_check;
alter table public.purchase_items add constraint purchase_items_product_sku_check check (product_sku is null or length(btrim(product_sku)) between 1 and 100);

create function public.create_business_onboarding(
  p_name text,
  p_business_type text,
  p_enabled_modules public.optional_module[],
  p_icon_id text,
  p_currency text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid(); v_business_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication is required' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user_id::text, 0));
  if exists (select 1 from public.business_members where user_id = v_user_id and status = 'active') then raise exception 'An active business membership already exists' using errcode = '23505'; end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 160 then raise exception 'Business name must be between 1 and 160 characters' using errcode = '22023'; end if;
  if p_business_type is not null and length(btrim(p_business_type)) not between 1 and 80 then raise exception 'Business type must be between 1 and 80 characters' using errcode = '22023'; end if;
  if p_currency is null or p_currency not in ('GHS', 'USD', 'EUR', 'GBP', 'NGN', 'ZAR') then raise exception 'Business currency is not supported' using errcode = '22023'; end if;
  if array_position(p_enabled_modules, null) is not null then raise exception 'Module selection cannot contain null values' using errcode = '22023'; end if;
  if p_icon_id is null or p_icon_id not in ('store', 'building', 'warehouse', 'landmark', 'shopping-bag') then raise exception 'Business icon is not supported' using errcode = '22023'; end if;
  insert into public.businesses (name, business_type, owner_user_id, icon_id, currency) values (btrim(p_name), nullif(btrim(p_business_type), ''), v_user_id, p_icon_id, p_currency) returning id into v_business_id;
  update public.business_modules set enabled = true where business_id = v_business_id and module = any(coalesce(p_enabled_modules, array[]::public.optional_module[]));
  return v_business_id;
end; $$;
revoke all on function public.create_business_onboarding(text, text, public.optional_module[], text, text) from public, anon;
grant execute on function public.create_business_onboarding(text, text, public.optional_module[], text, text) to authenticated;

create function public.create_additional_business(
  p_name text,
  p_business_type text,
  p_enabled_modules public.optional_module[],
  p_icon_id text,
  p_currency text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid(); v_business_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication is required' using errcode = '42501'; end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 160 then raise exception 'Business name must be between 1 and 160 characters' using errcode = '22023'; end if;
  if p_business_type is null or length(btrim(p_business_type)) not between 1 and 80 then raise exception 'Business type must be between 1 and 80 characters' using errcode = '22023'; end if;
  if p_currency is null or p_currency not in ('GHS', 'USD', 'EUR', 'GBP', 'NGN', 'ZAR') then raise exception 'Business currency is not supported' using errcode = '22023'; end if;
  if array_position(p_enabled_modules, null) is not null then raise exception 'Module selection cannot contain null values' using errcode = '22023'; end if;
  if p_icon_id is null or p_icon_id not in ('store', 'building', 'warehouse', 'landmark', 'shopping-bag') then raise exception 'Business icon is not supported' using errcode = '22023'; end if;
  insert into public.businesses (name, business_type, owner_user_id, icon_id, currency) values (btrim(p_name), btrim(p_business_type), v_user_id, p_icon_id, p_currency) returning id into v_business_id;
  update public.business_modules set enabled = true where business_id = v_business_id and module = any(coalesce(p_enabled_modules, array[]::public.optional_module[]));
  return v_business_id;
end; $$;
revoke all on function public.create_additional_business(text, text, public.optional_module[], text, text) from public, anon;
grant execute on function public.create_additional_business(text, text, public.optional_module[], text, text) to authenticated;
