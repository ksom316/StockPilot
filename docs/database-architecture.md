# Database architecture

## Relationships and tenancy

`profiles` is a one-to-one extension of `auth.users`. A profile can belong to many businesses through `business_members`; each business has one immutable owner reference until a reviewed ownership-transfer workflow is introduced.

Every operational row is tenant-scoped by `business_id`. Composite foreign keys ensure that products, inventory movements, sales, and sale items cannot cross business boundaries. Tenant isolation is enforced through RLS policies and narrow RPC mutation boundaries.

```text
auth.users ── profiles ──< business_members >── businesses
                                      │              ├── business_modules
                                      │              ├── categories
                                      │              ├── products ──< inventory_movements
                                      │              └── sales ──< sale_items >── products
                                      └── actor of inventory_movements and sales
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
| Sales | Read and record through RPC | Read and record through RPC | Read and record through RPC | Read and record through RPC |

Profiles are private to their user. Authenticated users can select their own profile and update only `display_name`; Auth credentials remain in `auth.users` and are never exposed through `profiles`.

Grants and policies are both required. The `anon` role has no application table or function privileges. The `authenticated` role receives table `SELECT` only where needed and column-level mutation grants. Immutable identifiers, tenant keys, timestamps, ownership, and stock balances are excluded from client update grants.

Private trigger functions use a locked search path and are not executable by browser roles. The profile trigger is the only Auth integration: it creates a profile when Supabase Auth creates a user.

### Inventory mutation security

Authenticated clients have no `INSERT`, `UPDATE`, or `DELETE` grants on `inventory_movements`. They also lack `INSERT` and `UPDATE` privileges for `products.current_quantity`. This prevents a client from changing a balance without its audit record.

`record_inventory_movement` is the narrow write boundary. It must be `SECURITY DEFINER` so it can write those protected fields, and therefore performs explicit authorization before mutation: it derives the actor from `auth.uid()`, requires an active owner, manager, or employee membership for the product's business, and restricts authenticated calls to `manual` source records with no source reference. Cashiers and cross-tenant callers are rejected. Trusted service-role calls may later use `system`, `sales`, or `purchasing` sources. The function keeps a locked search path, locks the product row, rejects negative stock, updates the balance, and inserts history in one transaction.

The pgTAP suite in `supabase/tests/` exercises cross-tenant reads and writes, owner and employee management, cashier restrictions, privilege boundaries, role escalation, module changes, inventory authorization, negative-stock rejection, source forgery, and authenticated actor recording. Run it against a reset local Supabase stack with `npx supabase test db`.

## Sales transaction strategy

`sales` stores immutable business-scoped headers and a sequential `SALE-000001` reference. Number allocation takes a transaction-level advisory lock scoped to the business, so concurrent businesses do not block each other and two sales in one business cannot receive the same number. `sale_items` repeats `business_id` to preserve the tenant boundary through composite foreign keys.

Each sale item snapshots the product name, SKU, quantity, and transaction unit price. Product renames, SKU changes, deactivation, or later catalog repricing therefore do not alter historical sales. Callers may supply a nonnegative unit price with at most four decimal places; this supports a basic product + quantity + price sale without adding discounts. The transaction price never updates `products.selling_price`. Line totals are rounded to four decimal places and checked against quantity multiplied by unit price. With no tax or discount model yet, `sales.total` must equal `subtotal`.

`record_sale(jsonb, text)` is the only Sales mutation boundary available to authenticated clients. It derives the actor from `auth.uid()`, derives the business from an accessible product, requires active membership and an enabled Sales module, rejects duplicate products, validates every product belongs to the same business and is active, and locks product rows in UUID order. After checking current locked balances, it creates the header and snapshots, updates every balance, and appends one `inventory_movements` row per item with `source_type = 'sales'` and the sale UUID as `source_reference`. PostgreSQL rolls the entire call back if any validation, insert, or deduction fails.

All active owner, manager, employee, and cashier members can read and record sales. This intentionally allows cashiers to sell while the existing manual inventory RPC continues to reject cashier adjustments. Clients receive read-only access to `sales` and `sale_items`; they cannot directly insert, update, or delete sales, forge totals or actors, or mutate the ledger. Sales RLS hides both tables across tenants.

Current Sales limitations are deliberate: there is no customer, payment, tax, discount, receipt, refund, cancellation, or editing workflow. Recorded sales are immutable. Reversal and cancellation require a future audited workflow that restores stock rather than deleting history.

## Deliberately deferred

- Invitation and ownership-transfer workflows
- Sales UI, refunds/cancellations, purchasing, customer, supplier, expense, AI, forecast, notification, and analytics tables
- Seed or demo data
- UI and generated TypeScript database types
- Finer role capabilities and cashier inventory permissions
- Backend integration for trusted Purchasing movement sources
