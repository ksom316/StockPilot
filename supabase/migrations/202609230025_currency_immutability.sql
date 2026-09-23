create or replace function private.prevent_business_currency_change_after_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.currency is distinct from old.currency
     and (
       exists (select 1 from public.sales where business_id = old.id)
       or exists (select 1 from public.purchases where business_id = old.id)
       or exists (select 1 from public.expenses where business_id = old.id)
     ) then
    raise exception 'Business currency cannot be changed after financial activity has been recorded'
      using errcode = '55006';
  end if;

  return new;
end;
$$;

drop trigger if exists businesses_currency_immutability on public.businesses;
create trigger businesses_currency_immutability
before update of currency on public.businesses
for each row
execute function private.prevent_business_currency_change_after_activity();

create or replace function public.get_business_financial_activity(p_business_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_business_id is null or not private.is_active_business_member(p_business_id) then
    raise exception 'Workspace access is not available' using errcode = '42501';
  end if;

  return exists (select 1 from public.sales where business_id = p_business_id)
    or exists (select 1 from public.purchases where business_id = p_business_id)
    or exists (select 1 from public.expenses where business_id = p_business_id);
end;
$$;

revoke all on function public.get_business_financial_activity(uuid) from public;
grant execute on function public.get_business_financial_activity(uuid) to authenticated;
