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
| Customers | Read all fields including private note, create, edit, deactivate/reactivate, profile/history | Same as owner | Basic lookup and create/select; no notes or customer profile/history | Basic lookup and create/select; no notes or customer profile/history |
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

Customers is an optional module, independent of Sales. A customer is a minimal tenant-scoped record with a trimmed 1–160 character name, optional phone (up to 50 characters), email (up to 320), private note (up to 2,000), active flag, and timestamps. Duplicate names, phone numbers, and emails are allowed; there is no automatic merge. Customer records are deactivated/reactivated; application roles have no hard-delete capability. Checkout quick-create is deliberately limited to name, phone, and email for every role, and duplicate matches warn without blocking creation.

Walk-in/anonymous sales have `customer_id = NULL` and no customer-name snapshot. A linked sale stores the tenant-safe customer ID plus only the trimmed customer name as an immutable sale-time snapshot; phone, email, and note are never copied to Sales. Existing sales remain anonymous and are not backfilled or retroactively assigned. Sales history reads the snapshot as transaction history, so it remains available if Customers is disabled or the live customer is renamed/deactivated.

RLS requires active membership and enabled Customers. Direct table reads are owner/manager-only so the private `note` is not exposed through a shared Supabase `authenticated` database role. Employee/cashier basic lookup uses `lookup_customers`, which returns only active ID/name/phone/email/status fields. Writes go through `create_customer`, `update_customer`, and `set_customer_active`: employees/cashiers may create without notes, but only owners/managers may edit or change lifecycle state. The `get_customer_activity` RPC is likewise owner/manager-only, business-scoped, and returns current customer details plus linked immutable Sales history and exact Recorded Sales totals as decimal text; it does not return cost/profit/Finance data. Operational Sales access is separate and unchanged: any active member permitted by the existing Sales RLS can read individual Sales records, including their immutable customer-name snapshot. The owner/manager Customer profile/summary is a privileged convenience/management surface, not a confidentiality boundary against roles that can already inspect individual Sales. Disabling Customers hides customer navigation/profile/checkout lookup and denies customer APIs, while Walk-in Sales and historical Sales snapshots remain available. Customers directory and profile work without the Sales module; a new customer with no linked sales has zero Recorded Sales. No CRM, payment, balance, or loyalty behavior is implied.

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

## Descriptive business overview analytics

`get_business_overview(business_id, start_date, end_date)` is the bounded Phase 8 operational analytics boundary for Inventory, Sales, and Purchasing. It requires an authenticated active business member and returns the business timezone, explicit module state, and structured aggregate facts. Date inputs are inclusive business-local calendar dates; Sales and Purchasing timestamp filters use half-open UTC bounds derived from the validated IANA timezone. Ranges are limited to 366 calendar days, and Sales daily trend output includes every local date (including zero-activity days).

Inventory counts are always available to active members and describe CURRENT stock, independent of the selected analytics period. Active products with zero quantity are out of stock; positive quantities at or below the low-stock threshold are low stock, matching the Inventory UI. These states do not overlap, so the dashboard can label the remainder In Stock without fetching products. No stock value or heterogeneous total quantity is reported. Sales metrics appear only when Sales is enabled and use immutable Sales and item data: Recorded Sales, sale count, average Recorded Sale rounded to four decimals (NULL for no sales), Units Sold During Period, top five products ranked by units sold, and a zero-filled daily trend. Recorded Sales means the total of completed operational sales; it is not accounting revenue, payment activity, or cash received. Product labels come from transaction snapshots; if a product was renamed during the selected range, its latest snapshot in that range labels the single aggregated product entry. These are descriptive facts, not fast-moving predictions or recommendations.

Purchasing metrics appear only when Purchasing is enabled and the active role is owner, manager, or employee, matching existing Purchasing read access. Cashiers can distinguish the module's enabled state but receive no Purchasing measurements. Purchase Receipt totals and quantities received are separate operational activity, never expenses or COGS. Disabled modules are explicitly marked disabled; enabled modules with no activity return zero totals and counts, empty top-product arrays, zero-filled trend buckets, and a NULL average where applicable. Numeric money/quantity fields inside JSON are serialized as decimal strings to avoid JavaScript floating-point loss; counts are integers.

Finance is intentionally not included: authorized dashboard callers continue to use `get_financial_summary` as the sole source of Operating Expenses and estimated profitability. It requires active owner/manager Finance access (including the enabled Expenses module); employees and cashiers cannot execute it. Estimated Gross Profit, Estimated Net Profit, and Estimated Margins depend on disclosed cost coverage and are not accounting COGS or net income. Purchase Receipts remain separate from expenses and cost of goods sold. The dashboard uses the same business-local date range for its period metrics and passes invalid custom ranges as unavailable; Today, Monday-to-Sunday This Week, This Month, and valid inclusive custom dates are derived in the business IANA timezone, with custom ranges limited to 366 days. Period changes select business-and-date-specific query keys. Inventory and transaction mutations invalidate that business's overview cache, while expense writes invalidate the separate Finance summary cache. Operational and Finance errors are displayed independently.

The Phase 8 dashboard is descriptive and module-aware: Inventory is core; Sales metrics/trend appear only when Sales is enabled; Purchasing measurements require the module and an owner, manager, or employee role; Finance requires enabled Expenses and owner/manager access. Customers does not affect dashboard analytics. The Recorded Sales Trend plots only the overview's daily trend response (numeric conversion is restricted to chart coordinates; exact decimal strings remain canonical for display). Inventory Status is a current snapshot and is not historical. Text metrics/counts accompany visualizations, so charts are supplementary rather than the only representation. Top Products remains a ranked list by Units Sold, not a recommendation.

Customer analytics are deferred. The overview performs no recommendations, comparisons, forecasts, or AI analysis. Phase 8 intentionally does not include period comparisons or percentage changes, inventory velocity or fast/slow-moving detection, reorder suggestions, predictive analytics, customer analytics, supplier rankings, category deep dives, inventory valuation, accounting-grade COGS/net income, forecasting, Smart Inventory, AI Analyst, or Business Opportunity Advisor. Existing business/date indexes on Sales and Purchasing support the bounded timestamp filters; no extra index is added for this foundation. The local Auth/PostgREST closeout smoke check and pgTAP suite exercise module/role and cross-tenant boundaries. Vite currently reports a primary client chunk above 500 kB; a larger bundling/code-splitting effort is deferred to Phase 15 production polish.

## Deterministic Smart Inventory foundation

`get_smart_inventory_snapshot(business_id, page, page_size)` is the focused, paginated Phase 9 data boundary for active-product inventory intelligence. It is separate from both the descriptive dashboard overview and the canonical Finance summary. The RPC requires an authenticated active owner, manager, or employee membership and an enabled `smart_insights` module; cashiers, inactive/non-members, cross-tenant callers, and anonymous callers are rejected server-side. Page size is bounded to 100 and products use stable case-insensitive name/name/ID ordering. The response contains no costs, customer data, expenses, profit, margins, or other Finance information.

The observation window is the 30 most recently completed dates in the business's validated IANA timezone: `[local midnight 30 dates before today, today's local midnight)`. The current partial local date is excluded, and local boundaries are converted to timestamps in PostgreSQL so client/session timezones cannot shift them. Product creation and the Sales module row's transition-aware `updated_at` conservatively establish the first provably observable full local date. A no-op `enabled = true` update preserves that boundary, while a real disable followed by re-enable establishes a new boundary. Existing enabled rows retain their pre-correction timestamp, which remains conservative where the historical enable time cannot be proven. Products without 30 proven dates return `INSUFFICIENT_HISTORY`; the RPC never fabricates historical Sales coverage.

Canonical product demand is the exact quantity on immutable `sale_items` joined to completed Sales inside that window. Sales-created inventory movements are not counted again. Manual Stock Out, Damaged, Lost, Adjustment/Correction/Other, Purchasing stock-in, and system movements are not customer demand. When Sales is disabled, the RPC returns inventory-safe facts with `SALES_DISABLED` and makes no demand, rate, no-sales, or days-of-stock claim. With full coverage, zero quantity yields `NO_RECORDED_SALES_30D`; positive quantity yields `RECORDED_SALES_OBSERVED`. Inventory movement count and exact net movement are separately reported as factual ledger activity and never labeled demand or Sales.

Current stock states preserve existing semantics: zero is `OUT_OF_STOCK`; a positive quantity at or below the existing low-stock threshold is `LOW_STOCK`; everything else is `IN_STOCK`. Out-of-stock and low-stock states set factual reorder attention, but no order quantity, lead time, safety stock, or forecast is inferred. Threshold zero is returned as the stored value without claiming it was explicitly configured.

Estimated Days of Stock is available only with Sales enabled, 30 complete observable dates, at least three distinct Recorded Sales dates, positive Recorded Sales quantity, and positive current stock. PostgreSQL calculates the exact numeric result as `current_quantity * 30 / recorded_sales_quantity`; zero stock, zero demand, sparse demand, disabled Sales, and insufficient history return a structured unavailability reason instead of infinity or a misleading estimate. Quantities, daily averages, and estimates remain PostgreSQL `numeric` values serialized as decimal strings. Frontends must not replace them with JavaScript floating-point calculations.

Phase 9A deliberately does not classify products as Fast/Normal/Slow, identify possible excess stock, recommend order quantities, perform supplier analysis, value inventory, or use predictions, AI, OpenRouter, the AI Analyst, or the Business Opportunity Advisor. Purchasing is not required and contributes no receipt/cost data to this initial contract. The existing bounded Sales, sale-item, product, and movement indexes support the snapshot query; new indexes should be added only if measured production-like query plans demonstrate a need.

Two Phase 9 limitations remain intentional: a Sales transition timestamp can theoretically precede transaction visibility when a transition executes before business-local midnight but commits afterward; and the UI currently does not surface the backend's `RECORDED_INVENTORY_MOVEMENTS_OBSERVED` explanation, although its factual movement fields remain available in the RPC response. These are deferred to later production hardening and polish, respectively.

## Deliberately deferred

- Invitation and ownership-transfer workflows
- Refunds/cancellations, purchase orders/drafts/returns, customer, AI, forecast, notification, and analytics tables
- Seed or demo data
- Generated TypeScript database types
- Finer role capabilities and cashier inventory permissions
- Accounting inventory valuation, accounting COGS/net income, FIFO/LIFO, and weighted-average costing
