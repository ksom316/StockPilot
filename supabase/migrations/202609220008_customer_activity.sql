-- StockPilot Phase 7C: privileged customer activity profile and exact Sales summary.

create function public.get_customer_activity(p_business_id uuid, p_customer_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.business_role := private.active_business_role(p_business_id);
  v_customer public.customers%rowtype;
  v_sale_count bigint;
  v_recorded_sales_total text;
  v_first_sale_at timestamptz;
  v_last_sale_at timestamptz;
  v_sales jsonb;
begin
  if (select auth.uid()) is null or (select auth.role()) <> 'authenticated'
    or v_role is null or v_role not in ('owner', 'manager') then
    raise exception 'Customer activity is unavailable for this workspace or role' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.business_modules as module
    where module.business_id = p_business_id
      and module.module = 'customers'
      and module.enabled
  ) then
    raise exception 'Customers is not enabled for this business' using errcode = '42501';
  end if;

  select customer.* into v_customer
  from public.customers as customer
  where customer.business_id = p_business_id and customer.id = p_customer_id;
  if not found then
    raise exception 'Customer was not found or is not accessible' using errcode = '42501';
  end if;

  select
    count(*)::bigint,
    coalesce(sum(sale.total), 0)::numeric::text,
    min(sale.sold_at),
    max(sale.sold_at)
  into v_sale_count, v_recorded_sales_total, v_first_sale_at, v_last_sale_at
  from public.sales as sale
  where sale.business_id = p_business_id and sale.customer_id = p_customer_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', sale.id,
        'sale_reference', sale.sale_reference,
        'sold_at', sale.sold_at,
        'total', sale.total::text,
        'customer_name_snapshot', sale.customer_name_snapshot,
        'item_count', (
          select count(*)::integer from public.sale_items as item
          where item.business_id = p_business_id and item.sale_id = sale.id
        )
      ) order by sale.sold_at desc, sale.sale_number desc
    ),
    '[]'::jsonb
  ) into v_sales
  from public.sales as sale
  where sale.business_id = p_business_id and sale.customer_id = p_customer_id;

  return jsonb_build_object(
    'customer', jsonb_build_object(
      'id', v_customer.id,
      'name', v_customer.name,
      'phone', v_customer.phone,
      'email', v_customer.email,
      'note', v_customer.note,
      'is_active', v_customer.is_active,
      'created_at', v_customer.created_at,
      'updated_at', v_customer.updated_at
    ),
    'summary', jsonb_build_object(
      'sale_count', v_sale_count,
      'recorded_sales_total', v_recorded_sales_total,
      'first_sale_at', v_first_sale_at,
      'last_sale_at', v_last_sale_at
    ),
    'sales', v_sales
  );
end;
$$;

revoke all on function public.get_customer_activity(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_customer_activity(uuid, uuid) to authenticated;

comment on function public.get_customer_activity(uuid, uuid) is
  'Owner/manager-only Customer profile activity. Uses business-scoped immutable Sales data; returns exact Recorded Sales as decimal text and no cost or Finance fields.';

