# Database architecture

## Relationships and tenancy

`profiles` is a one-to-one extension of `auth.users`. A profile can belong to many businesses through `business_members`; each business has one immutable owner reference until a reviewed ownership-transfer workflow is introduced.

Every operational row is tenant-scoped by `business_id`. Composite foreign keys ensure that products, inventory movements, sales, sale items, suppliers, purchases, purchase items, expense categories, expenses, and expense audit rows cannot cross business boundaries. Tenant isolation is enforced through RLS policies and narrow RPC mutation boundaries.

```text
auth.users ── profiles ──< business_members >── businesses
                                      │              ├── business_modules
                                      │              ├── categories
                                      │              ├── products ──< inventory_movements
                                      │              ├── sales ──< sale_items >── products
                                      │              ├── suppliers ──< purchases
                                      │              └── purchases ──< purchase_items >── products
                                      └── actor of inventory movements, sales, and purchases
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

Manual inventory uses `source_type = 'manual'` and does not depend on any optional module. Sales and Purchasing use dedicated atomic transaction boundaries because each must write immutable transaction snapshots, update stock, and append linked movements in one transaction. Do not split those operations across RPCs. Purchasing movements use `source_type = 'purchasing'` and the purchase UUID as `source_reference`.

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
| Purchases | Read and record through RPC when enabled | Read and record through RPC when enabled | Read and record through RPC when enabled | No access |
| Suppliers | Read and manage when enabled | Read and manage when enabled | Read when enabled | No access |
| Customers | Read all fields including private note, create, edit, deactivate/reactivate; future history | Same as owner | Basic lookup, create/select; no notes or history | Basic lookup, create/select; no notes or history |
| Expenses and profitability | Read and manage through RPCs when enabled | Read and manage through RPCs when enabled | No access | No access |

Profiles are private to their user. Authenticated users can select their own profile and update only `display_name`; Auth credentials remain in `auth.users` and are never exposed through `profiles`.

Grants and policies are both required. The `anon` role has no application table or function privileges. The `authenticated` role receives table `SELECT` only where needed and column-level mutation grants. Immutable identifiers, tenant keys, timestamps, ownership, and stock balances are excluded from client update grants.

Private trigger functions use a locked search path and are not executable by browser roles. The profile trigger is the only Auth integration: it creates a profile when Supabase Auth creates a user.

### Inventory mutation security

Authenticated clients have no `INSERT`, `UPDATE`, or `DELETE` grants on `inventory_movements`. They also lack `INSERT` and `UPDATE` privileges for `products.current_quantity`. This prevents a client from changing a balance without its audit record.

`record_inventory_movement` is the narrow write boundary. It must be `SECURITY DEFINER` so it can write those protected fields, and therefore performs explicit authorization before mutation: it derives the actor from `auth.uid()`, requires an active owner, manager, or employee membership for the product's business, and restricts authenticated calls to `manual` source records with no source reference. Cashiers and cross-tenant callers are rejected. Trusted service-role calls may later use `system`, `sales`, or `purchasing` sources. The function keeps a locked search path, locks the product row, rejects negative stock, updates the balance, and inserts history in one transaction.

The pgTAP suite in `supabase/tests/` exercises cross-tenant reads and writes, owner and employee management, cashier restrictions, privilege boundaries, role escalation, module changes, inventory authorization, negative-stock rejection, source forgery, and authenticated actor recording. Run it against a reset local Supabase stack with `npx supabase test db`.

## Sales transaction strategy

`sales` stores immutable business-scoped headers and a sequential `SALE-000001` reference. Number allocation takes a transaction-level advisory lock scoped to the business, so concurrent businesses do not block each other and two sales in one business cannot receive the same number. `sale_items` repeats `business_id` to preserve the tenant boundary through composite foreign keys.

Each sale item snapshots the product name, SKU, quantity, and transaction unit price. New sale items also snapshot the product category identity/name and, when known, the latest/default estimated unit cost plus its `manual` or `purchasing` provenance. Product/category renames, deactivation, or later catalog repricing therefore do not alter historical sales. Existing sale items are not backfilled and retain unavailable estimated cost/category snapshots. Callers may supply a nonnegative unit price with at most four decimal places; this supports a basic product + quantity + price sale without adding discounts. The transaction price never updates `products.selling_price`. Line totals are rounded to four decimal places and checked against quantity multiplied by unit price. Estimated line cost is derived canonically as `round(quantity * estimated_unit_cost_basis, 4)` rather than stored. With no tax or discount model yet, `sales.total` must equal `subtotal`.

`record_sale(jsonb, text)` is the only Sales mutation boundary available to authenticated clients. It derives the actor from `auth.uid()`, derives the business from an accessible product, requires active membership and an enabled Sales module, rejects duplicate products, validates every product belongs to the same business and is active, and locks product rows in UUID order. After checking current locked balances, it creates the header and snapshots, updates every balance, and appends one `inventory_movements` row per item with `source_type = 'sales'` and the sale UUID as `source_reference`. PostgreSQL rolls the entire call back if any validation, insert, or deduction fails.

All active owner, manager, employee, and cashier members can read and record sales. This intentionally allows cashiers to sell while the existing manual inventory RPC continues to reject cashier adjustments. Clients receive read-only access to `sales` and `sale_items`; they cannot directly insert, update, or delete sales, forge totals or actors, or mutate the ledger. Sales RLS hides both tables across tenants.

Current Sales limitations are deliberate: there is no customer, payment, tax, discount, printable receipt, refund, cancellation, or editing workflow. Recorded sales are immutable. Reversal and cancellation require a future audited workflow that restores stock rather than deleting history. History filtering is currently client-side over the loaded business history; pagination/server-side filtering may be needed as sales volume grows.

## Customers foundation

Customers is an optional module, independent of Sales. A customer is a minimal tenant-scoped record with a trimmed 1–160 character name, optional phone (up to 50 characters), email (up to 320), private note (up to 2,000), active flag, and timestamps. Duplicate names, phone numbers, and emails are allowed; there is no automatic merge. Customer records are deactivated/reactivated and not normally hard-deleted.

Walk-in/anonymous sales have `customer_id = NULL` and no customer-name snapshot. A linked sale stores the tenant-safe customer ID plus only the trimmed customer name as an immutable sale-time snapshot; phone, email, and note are never copied to Sales. Existing sales remain anonymous and are not backfilled or retroactively assigned. Sales history reads the snapshot as transaction history, so it remains available if Customers is disabled or the live customer is renamed/deactivated.

RLS requires active membership and enabled Customers. Direct table reads are owner/manager-only so the private `note` is not exposed through a shared Supabase `authenticated` database role. Employee/cashier basic lookup uses `lookup_customers`, which returns only active ID/name/phone/email/status fields. Writes go through `create_customer`, `update_customer`, and `set_customer_active`: employees/cashiers may create without notes, but only owners/managers may edit or change lifecycle state. The `get_customer_activity` RPC is likewise owner/manager-only, business-scoped, and returns current customer details plus linked immutable Sales history and exact Recorded Sales totals; it does not return cost/profit/Finance data. Operational Sales access is separate and unchanged: any active member permitted by the existing Sales RLS can read individual Sales records, including their immutable customer-name snapshot. The owner/manager Customer profile/summary is a privileged convenience/management surface, not a confidentiality boundary against roles that can already inspect individual Sales. No CRM, payment, balance, or loyalty behavior is implied.

`record_sale` accepts an optional customer ID. A NULL customer remains valid when Customers is disabled. A non-NULL customer requires enabled Customers and an active customer in the same business. The RPC locks the customer row while validating it: whichever transaction obtains the lock first determines whether the sale associates while active or is rejected after deactivation commits. Stock, immutable sale/item snapshots, and movements remain one atomic transaction.

Sales currently has no persisted request-id idempotency protection. Adding it is a later hardening opportunity; Purchasing does not modify the existing Sales implementation.

## Purchasing transaction strategy

Purchasing represents completed stock receipts, not draft purchase orders. `purchases` stores immutable business-scoped headers with sequential `PUR-000001` references, while `purchase_items` stores immutable product-name, SKU, quantity, and transaction-cost snapshots. There is no ordered, approved, partially received, cancelled, payable, or paid lifecycle in this phase.

A supplier is optional. When selected, it must be an active supplier in the receipt's business and its name is snapshotted on the purchase. Later supplier or product edits and deactivation do not rewrite receipt history. Suppliers are normally deactivated; browser roles have no hard-delete capability.

`record_purchase(jsonb, uuid, uuid, text)` is the only purchase mutation boundary available to authenticated clients. It requires owner, manager, or employee membership and an enabled Purchasing module, rejects cashiers, validates every product and optional supplier against one business, rejects duplicate products, and locks products in UUID order. It creates the immutable header and items, increases stock, updates each product's current cost, and appends one linked `stock_in` movement per item in one database transaction. Any failure rolls back all of those effects. Direct purchase, purchase-item, ledger, and stock-balance writes remain unavailable to clients.

The caller supplies a request UUID. `(business_id, request_id)` is unique, and a business/request-scoped transaction advisory lock serializes concurrent retries. Repeating a completed request returns the existing purchase without adding stock, items, or movements again. The same UUID can be used independently by different businesses.

Purchasing is an optional module. Reads and supplier management require both the approved role and an enabled Purchasing module. Owner and manager roles can create, edit, and deactivate suppliers. Employees can read suppliers and record receipts but cannot manage suppliers. Cashiers cannot read cost-bearing Purchasing data. Disabling Purchasing hides its database reads and rejects new receipts without affecting manual Inventory. The current purchase-history screen loads the current business's history and filters it client-side; server pagination is intentionally deferred until volume warrants it.

`products.cost_price` means the latest/default received cost. `products.cost_source` distinguishes an unknown legacy/imported value from a deliberate manual cost and a Purchasing-established cost. Authenticated catalog cost creation/editing marks the value `manual`; every successful receipt replaces it with that line's unit cost and marks it `purchasing`, including a valid zero cost. The immutable purchase item keeps its historical transaction cost. Neither the value nor its sale-time snapshot is accounting COGS, weighted-average cost, FIFO/LIFO, realized cost, or inventory valuation.

## Finance foundation

Finance is guarded by the optional `expenses` module and is available only to active owners and managers. Disabling the module hides expense categories, expenses, audit history, and the financial summary and rejects mutations while preserving all rows. Re-enabling it restores access. Employee and cashier roles have no Finance access; their existing Inventory, Sales, and Purchasing permissions are unchanged.

Each business has a validated IANA `timezone`, defaulting to `UTC`. The canonical `get_financial_summary(business_id, start_date, end_date)` RPC interprets inclusive calendar dates in that timezone and converts Sales and Purchasing timestamps to half-open UTC boundaries. `expenses.expense_date` is already a business-local date. This supports today, Monday-to-Sunday weeks, months, and custom ranges without duplicating timezone boundary logic in clients.

The summary keeps these concepts separate:

- **Recorded Sales** is the sum of immutable sale totals.
- **Estimated Product Cost** is derived from sale-time estimated cost snapshots only when every selected sale item has a known basis.
- **Estimated Gross Profit/Margin** is returned only with complete cost coverage.
- **Operating Expenses** is the sum of non-void expenses by `expense_date`.
- **Estimated Net Profit/Margin** subtracts operating expenses only when estimated gross profit is available.
- **Purchase Receipts** is reported separately when Purchasing is enabled and is never subtracted directly as an expense.

The summary returns item coverage counts and a completeness flag. Any unknown cost makes estimated cost and profit outputs `NULL`, never zero. A genuine known zero remains `0` with provenance and is valid coverage. These are operational estimates, not accounting COGS or net income; StockPilot implements no FIFO, LIFO, weighted-average valuation, or historical cost backfill.

Each business receives eight modest system expense categories plus tenant-scoped custom categories. System categories are stable; custom categories can be renamed or deactivated but not hard-deleted through browser grants. Expenses snapshot the category name for history. Authorized clients create, update, and void expenses only through `create_expense`, `update_expense`, and `void_expense`. Voiding requires a reason, preserves the row, and excludes it from summaries. Each mutation appends an unforgeable `created`, `updated`, or `voided` before/after record to `expense_audit`; clients cannot directly mutate expenses or audit rows.

The initial Expenses screen loads the current business's expense rows and filters them client-side; pagination/server-side filtering is deferred until expense volume warrants it. Finance access remains independent of Sales and Purchasing: when either optional module is disabled, Finance continues to report its own available data and the RPC hides Purchase Receipts when Purchasing is disabled.

All money and derived values use PostgreSQL `numeric`, with stored money at `numeric(19,4)`, quantities at `numeric(18,3)`, four-decimal multiplication rounding, and six-decimal margin rounding. API consumers must preserve numeric values as decimal strings rather than JavaScript floating-point numbers.

## Deliberately deferred

- Invitation and ownership-transfer workflows
- Refunds/cancellations, purchase orders/drafts/returns, customer, AI, forecast, notification, and analytics tables
- Seed or demo data
- Generated TypeScript database types
- Finer role capabilities and cashier inventory permissions
- Accounting inventory valuation, accounting COGS/net income, FIFO/LIFO, and weighted-average costing
