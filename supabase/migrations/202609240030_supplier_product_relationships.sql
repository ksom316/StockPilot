-- StockPilot: current supplier/product relationships.
-- Receipt history remains independent and continues to use its snapshots.

create table public.supplier_products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  supplier_id uuid not null,
  product_id uuid not null,
  is_preferred boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_products_business_id_id_key unique (business_id, id),
  constraint supplier_products_business_supplier_fk foreign key (business_id, supplier_id)
    references public.suppliers (business_id, id) on delete cascade,
  constraint supplier_products_business_product_fk foreign key (business_id, product_id)
    references public.products (business_id, id) on delete cascade,
  constraint supplier_products_business_supplier_product_key unique (business_id, supplier_id, product_id)
);

create index supplier_products_business_product_idx on public.supplier_products (business_id, product_id);
create index supplier_products_business_supplier_idx on public.supplier_products (business_id, supplier_id);
create unique index supplier_products_one_preferred_idx
  on public.supplier_products (business_id, product_id)
  where is_preferred;

create trigger supplier_products_set_updated_at
before update on public.supplier_products
for each row execute function private.set_updated_at();

alter table public.supplier_products enable row level security;
revoke all on table public.supplier_products from public, anon, authenticated;
grant select, insert (business_id, supplier_id, product_id, is_preferred), update (is_preferred), delete
  on table public.supplier_products to authenticated;

create policy supplier_products_select_purchasing_staff
on public.supplier_products for select to authenticated
using (
  (select private.active_business_role(business_id)) in ('owner', 'manager', 'employee')
  and exists (select 1 from public.business_modules module
    where module.business_id = supplier_products.business_id
      and module.module = 'purchasing' and module.enabled)
);

create policy supplier_products_insert_purchasing_managers
on public.supplier_products for insert to authenticated
with check (
  (select private.active_business_role(business_id)) in ('owner', 'manager')
  and exists (select 1 from public.business_modules module
    where module.business_id = supplier_products.business_id
      and module.module = 'purchasing' and module.enabled)
);

create policy supplier_products_update_purchasing_managers
on public.supplier_products for update to authenticated
using (
  (select private.active_business_role(business_id)) in ('owner', 'manager')
  and exists (select 1 from public.business_modules module
    where module.business_id = supplier_products.business_id
      and module.module = 'purchasing' and module.enabled)
)
with check (
  (select private.active_business_role(business_id)) in ('owner', 'manager')
  and exists (select 1 from public.business_modules module
    where module.business_id = supplier_products.business_id
      and module.module = 'purchasing' and module.enabled)
);

create policy supplier_products_delete_purchasing_managers
on public.supplier_products for delete to authenticated
using (
  (select private.active_business_role(business_id)) in ('owner', 'manager')
  and exists (select 1 from public.business_modules module
    where module.business_id = supplier_products.business_id
      and module.module = 'purchasing' and module.enabled)
);

comment on table public.supplier_products is 'Current business-scoped supplier/product links; purchase receipts remain historical snapshots.';
