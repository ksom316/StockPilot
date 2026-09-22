-- Preserve business_modules.updated_at as the provable module-state transition
-- boundary used by Smart Inventory. Generic row-update timestamps are too broad:
-- retrying enabled = true must not make established Sales history unobservable.
-- Existing rows are intentionally not rewritten: their current timestamp remains
-- the conservative boundary where the historical enable time cannot be proven.

create function private.set_business_module_transition_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.enabled is distinct from old.enabled then
    new.updated_at = statement_timestamp();
  else
    new.updated_at = old.updated_at;
  end if;

  return new;
end;
$$;

drop trigger business_modules_set_updated_at on public.business_modules;

create trigger business_modules_set_updated_at
before update on public.business_modules
for each row execute function private.set_business_module_transition_at();

comment on function private.set_business_module_transition_at() is
  'Keeps business_modules.updated_at as the latest real enabled-state transition. No-op enabled updates preserve the existing boundary.';
