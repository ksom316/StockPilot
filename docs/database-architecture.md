# Database architecture

## Relationships and tenancy

`profiles` is a one-to-one extension of `auth.users`. A profile can belong to many businesses through `business_members`; each business has one immutable owner reference until a reviewed ownership-transfer workflow is introduced.

Every operational row is tenant-scoped by `business_id`. Composite foreign keys ensure that a product cannot reference another business's category and an inventory movement cannot reference another business's product. Tenant isolation will be enforced through RLS policies in the next security phase.

```text
auth.users ── profiles ──< business_members >── businesses
                                      │              ├── business_modules
                                      │              ├── categories
                                      │              └── products ──< inventory_movements
                                      └── actor of inventory_movements
```

Creating a business atomically adds its owner membership and disabled rows for every optional module. Owner, manager, employee, and cashier roles are represented, but invitation and role-management workflows are intentionally deferred.

## Module strategy

Inventory is core application behavior, not a feature flag. It is deliberately excluded from the `optional_module` enum, so it cannot be disabled or accidentally omitted. `business_modules` represents only `sales`, `purchasing`, `expenses`, `customers`, `analytics`, `smart_insights`, and `team`. Each new business receives an explicit disabled row for every optional module, allowing later enable/disable changes without changing inventory access.

Adding another optional module requires a migration that adds an enum value and inserts its default row for existing businesses.

## Inventory strategy

`products.current_quantity` is the current balance, while `inventory_movements` is the append-only audit history. Movement quantities are stored as signed deltas:

- `stock_in` is positive.
- `stock_out`, `damaged`, and `lost` are negative.
- `adjustment` can be positive or negative.

Callers pass a positive magnitude for every movement except `adjustment`, which accepts a signed delta. `record_inventory_movement` locks the product row with `FOR UPDATE`, calculates and validates the new balance, updates the product, and inserts the movement. A failure rolls back the whole statement. Negative inventory is rejected by both the function and table constraints.

Manual inventory uses `source_type = 'manual'` and does not depend on any optional module. Future Sales and Purchasing code will call the same function with `source_type = 'sales'` or `'purchasing'` and place its future record UUID in `source_reference`; no foreign key is added until those modules exist.

## Security boundary

RLS is enabled on every public application table. This phase deliberately creates no permissive policies and revokes table privileges from `anon` and `authenticated`, so browser access fails closed. The inventory function is `SECURITY INVOKER`; it cannot bypass RLS. The next security phase must add reviewed per-operation grants and policies based on active `business_members` rows before the frontend uses these tables.

Private trigger functions use a locked search path and are not executable by browser roles. The profile trigger is the only Auth integration: it creates a profile when Supabase Auth creates a user.

## Deliberately deferred

- Production RLS policies and policy tests
- Invitation and ownership-transfer workflows
- Sales, purchasing, customer, supplier, expense, AI, forecast, notification, and analytics tables
- Seed or demo data
- UI and generated TypeScript database types
