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

RLS is enabled on every public application table. Policies derive tenant access from the caller's active `business_members` row. Three minimal helpers in the unexposed `private` schema read membership and ownership facts without triggering recursive membership policies. They are `SECURITY DEFINER`, use an empty search path, schema-qualify every relation, and return information only about `auth.uid()`.

The role permissions are:

| Resource | Owner | Manager | Employee | Cashier |
| --- | --- | --- | --- | --- |
| Business | Read and edit settings | Read | Read | Read |
| Memberships | Read and manage non-owner members | Read | Read | Read |
| Optional modules | Read and toggle | Read | Read | Read |
| Categories | Read and manage | Read and manage | Read and manage | Read |
| Products | Read and manage | Read and manage | Read and manage | Read |
| Inventory history | Read and create through RPC | Read and create through RPC | Read and create through RPC | Read |

Profiles are private to their user. Authenticated users can select their own profile and update only `display_name`; Auth credentials remain in `auth.users` and are never exposed through `profiles`.

Grants and policies are both required. The `anon` role has no application table or function privileges. The `authenticated` role receives table `SELECT` only where needed and column-level mutation grants. Immutable identifiers, tenant keys, timestamps, ownership, and stock balances are excluded from client update grants.

Private trigger functions use a locked search path and are not executable by browser roles. The profile trigger is the only Auth integration: it creates a profile when Supabase Auth creates a user.

### Inventory mutation security

Authenticated clients have no `INSERT`, `UPDATE`, or `DELETE` grants on `inventory_movements`. They also lack `INSERT` and `UPDATE` privileges for `products.current_quantity`. This prevents a client from changing a balance without its audit record.

`record_inventory_movement` is the narrow write boundary. It must be `SECURITY DEFINER` so it can write those protected fields, and therefore performs explicit authorization before mutation: it derives the actor from `auth.uid()`, requires an active owner, manager, or employee membership for the product's business, and restricts authenticated calls to `manual` source records with no source reference. Cashiers and cross-tenant callers are rejected. Trusted service-role calls may later use `system`, `sales`, or `purchasing` sources. The function keeps a locked search path, locks the product row, rejects negative stock, updates the balance, and inserts history in one transaction.

The pgTAP suite in `supabase/tests/` exercises cross-tenant reads and writes, owner and employee management, cashier restrictions, privilege boundaries, role escalation, module changes, inventory authorization, negative-stock rejection, source forgery, and authenticated actor recording. Run it against a reset local Supabase stack with `npx supabase test db`.

## Deliberately deferred

- Invitation and ownership-transfer workflows
- Sales, purchasing, customer, supplier, expense, AI, forecast, notification, and analytics tables
- Seed or demo data
- UI and generated TypeScript database types
- Finer role capabilities and cashier inventory permissions
- Backend integration for trusted Sales and Purchasing movement sources
