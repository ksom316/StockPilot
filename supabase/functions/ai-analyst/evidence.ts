import { availability, isRecordValue, type AnalystContext, type Evidence } from "./contract.ts"

function path(record: Record<string, unknown>, ...keys: string[]): unknown {
  let current: unknown = record
  for (const key of keys) {
    if (!isRecordValue(current)) return undefined
    current = current[key]
  }
  return current
}

function scalar(value: unknown): string | null {
  return typeof value === "string" || typeof value === "number" ? String(value) : null
}

export function buildEvidenceRegistry(context: AnalystContext): Map<string, Evidence> {
  const registry = new Map<string, Evidence>()
  const period = context.period.key
  const currency = context.business.currency
  const add = (id: string, label: string, value: unknown, money = false) => {
    const rendered = scalar(value)
    if (rendered !== null) {
      registry.set(id, { id, label, value: money ? `${currency} ${rendered}` : rendered, period })
    }
  }

  add("inventory.active_products", "Active Products", path(context.inventory, "currentState", "active_products"))
  add("inventory.out_of_stock", "Out of Stock Products", path(context.inventory, "currentState", "out_of_stock_products"))
  add("inventory.low_stock", "Low Stock Products", path(context.inventory, "currentState", "low_stock_products"))
  add("inventory.attention", "Products Needing Stock Attention", path(context.inventory, "attention", "totalProducts"))

  if (availability(context.sales) === "AVAILABLE") {
    add("sales.recorded_sales", "Recorded Sales", path(context.sales, "facts", "recorded_sales"), true)
    add("sales.sale_count", "Completed Sales", path(context.sales, "facts", "sale_count"))
    add("sales.units_sold", "Units Sold", path(context.sales, "facts", "units_sold"))
  }
  if (availability(context.purchasing) === "AVAILABLE") {
    add("purchasing.receipt_total", "Purchase Receipts", path(context.purchasing, "facts", "purchase_receipts"), true)
    add("purchasing.receipt_count", "Purchase Receipt Count", path(context.purchasing, "facts", "receipt_count"))
    add("purchasing.quantity_received", "Quantity Received", path(context.purchasing, "facts", "quantity_received"))
  }
  if (availability(context.finance) === "AVAILABLE") {
    add("finance.operating_expenses", "Operating Expenses", path(context.finance, "facts", "operatingExpenses"), true)
    add("finance.estimated_product_cost", "Estimated Product Cost", path(context.finance, "facts", "estimatedProductCost"), true)
    add("finance.estimated_gross_profit", "Estimated Gross Profit", path(context.finance, "facts", "estimatedGrossProfit"), true)
    add("finance.estimated_gross_margin", "Estimated Gross Margin", path(context.finance, "facts", "estimatedGrossMargin"))
    add("finance.estimated_net_profit", "Estimated Net Profit", path(context.finance, "facts", "estimatedNetProfit"), true)
    add("finance.estimated_net_margin", "Estimated Net Margin", path(context.finance, "facts", "estimatedNetMargin"))
  }
  return registry
}

export function hydrateEvidence(
  refs: string[],
  registry: Map<string, Evidence>,
): { evidence: Evidence[]; removedUnknown: boolean } {
  const evidence: Evidence[] = []
  const seen = new Set<string>()
  let removedUnknown = false
  for (const ref of refs) {
    if (seen.has(ref)) continue
    seen.add(ref)
    const trusted = registry.get(ref)
    if (trusted) evidence.push(trusted)
    else removedUnknown = true
  }
  return { evidence, removedUnknown }
}

export function suggestedQuestions(context: AnalystContext): string[] {
  const suggestions = ["Which products currently need stock attention?"]
  if (availability(context.sales) === "AVAILABLE") suggestions.push("How did Recorded Sales perform in this period?")
  if (availability(context.purchasing) === "AVAILABLE") suggestions.push("Summarize Purchase Receipts for this period.")
  if (availability(context.finance) === "AVAILABLE") suggestions.push("Summarize the available estimated profitability facts.")
  if (suggestions.length < 4 && availability(context.smartInventory) === "AVAILABLE") {
    suggestions.push("Explain the available Smart Inventory observations.")
  }
  return suggestions.slice(0, 4)
}

const DOMAIN_TERMS: Array<[keyof Pick<AnalystContext, "sales" | "purchasing" | "finance" | "smartInventory">, RegExp, string]> = [
  ["sales", /\b(sales?|units sold)\b/i, "Sales information is unavailable because the Sales module is disabled."],
  ["purchasing", /\b(purchases?|purchasing|receipts?|received)\b/i, "Purchasing information is unavailable because the Purchasing module is disabled."],
  ["finance", /\b(profits?|margins?|expenses?|product costs?|net income)\b/i, "Finance information is unavailable because the Expenses & Profit module is disabled."],
  ["smartInventory", /\b(smart inventory|days of stock|demand rate)\b/i, "Smart Inventory information is unavailable because the Smart Inventory module is disabled."],
]

export function unavailableDomainResponse(
  context: AnalystContext,
  question: string,
): { answer: string; limitations: string[] } | null {
  const requested = DOMAIN_TERMS.filter(([, pattern]) => pattern.test(question))
  if (requested.length !== 1) return null
  const [section, , message] = requested[0]
  return availability(context[section]) === "AVAILABLE"
    ? null
    : { answer: message, limitations: [message] }
}
