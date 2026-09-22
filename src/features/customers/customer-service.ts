import { supabase } from "@/lib/supabase"
import { CustomerDataError, type BasicCustomer, type CustomerActivity, type ManagedCustomer, type CustomerInput } from "@/features/customers/customer-types"

function requireClient() {
  if (!supabase) throw new CustomerDataError("Customers are not configured. Refresh and try again.")
  return supabase
}

function mapBasic(row: { id: string; name: string; phone: string | null; email: string | null; is_active: boolean }): BasicCustomer {
  return { id: row.id, name: row.name, phone: row.phone, email: row.email, isActive: row.is_active }
}

export async function fetchManagedCustomers(businessId: string): Promise<ManagedCustomer[]> {
  const { data, error } = await requireClient()
    .from("customers")
    .select("id,name,phone,email,note,is_active,created_at,updated_at")
    .eq("business_id", businessId)
    .order("name")
  if (error) throw new CustomerDataError("We couldn't load customers. Check that Customers is enabled and try again.", error.code)
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    note: row.note,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
}

export async function lookupCustomers(businessId: string): Promise<BasicCustomer[]> {
  const { data, error } = await requireClient().rpc("lookup_customers", { p_business_id: businessId })
  if (error) throw new CustomerDataError("We couldn't load customers. Check that Customers is enabled and try again.", error.code)
  return (data ?? []).map(mapBasic)
}

export async function fetchCustomerActivity(businessId: string, customerId: string): Promise<CustomerActivity> {
  const { data, error } = await requireClient().rpc("get_customer_activity", {
    p_business_id: businessId,
    p_customer_id: customerId,
  })
  if (error) {
    if (error.code === "42501") throw new CustomerDataError("Customer activity is unavailable for this workspace or role.", "ACCESS_DENIED")
    throw new CustomerDataError("We couldn't load this customer's activity. Please try again.", error.code)
  }
  if (!data || typeof data !== "object" || !("customer" in data) || !("summary" in data) || !("sales" in data)) {
    throw new CustomerDataError("Customer activity could not be read. Please try again.", "INVALID_ACTIVITY")
  }

  const result = data as {
    customer: { id: string; name: string; phone: string | null; email: string | null; note: string | null; is_active: boolean; created_at: string; updated_at: string }
    summary: { sale_count: number | string; recorded_sales_total: string; first_sale_at: string | null; last_sale_at: string | null }
    sales: Array<{ id: string; sale_reference: string; sold_at: string; total: string; customer_name_snapshot: string; item_count: number }>
  }
  return {
    id: result.customer.id,
    name: result.customer.name,
    phone: result.customer.phone,
    email: result.customer.email,
    note: result.customer.note,
    isActive: result.customer.is_active,
    createdAt: result.customer.created_at,
    updatedAt: result.customer.updated_at,
    saleCount: Number(result.summary.sale_count),
    recordedSalesTotal: result.summary.recorded_sales_total,
    firstSaleAt: result.summary.first_sale_at,
    lastSaleAt: result.summary.last_sale_at,
    sales: result.sales.map((sale) => ({
      id: sale.id,
      saleReference: sale.sale_reference,
      soldAt: sale.sold_at,
      total: sale.total,
      customerNameSnapshot: sale.customer_name_snapshot,
      itemCount: sale.item_count,
    })),
  }
}

export async function createCustomer(businessId: string, input: CustomerInput, canManage: boolean): Promise<string> {
  const params: { p_business_id: string; p_name: string; p_phone: string | null; p_email: string | null; p_note?: string | null } = {
    p_business_id: businessId,
    p_name: input.name,
    p_phone: input.phone,
    p_email: input.email,
  }
  if (canManage) params.p_note = input.note
  const { data, error } = await requireClient().rpc("create_customer", params)
  if (error) throw mapMutationError(error, "We couldn't save this customer.")
  if (typeof data !== "string") throw new CustomerDataError("The customer was created, but its confirmation could not be read.", "INVALID_RESPONSE")
  return data
}

export async function updateCustomer(businessId: string, customerId: string, input: CustomerInput): Promise<void> {
  const { error } = await requireClient().rpc("update_customer", {
    p_business_id: businessId,
    p_customer_id: customerId,
    p_name: input.name,
    p_phone: input.phone,
    p_email: input.email,
    p_note: input.note,
  })
  if (error) throw mapMutationError(error, "We couldn't update this customer.")
}

export async function setCustomerActive(businessId: string, customerId: string, active: boolean): Promise<void> {
  const { error } = await requireClient().rpc("set_customer_active", {
    p_business_id: businessId,
    p_customer_id: customerId,
    p_is_active: active,
  })
  if (error) throw mapMutationError(error, "We couldn't update this customer's status.")
}

function mapMutationError(error: { code?: string; message?: string }, fallback: string) {
  if (error.code === "42501") return new CustomerDataError("Customers are unavailable for this workspace or your role.", "ACCESS_DENIED")
  if (error.code === "23514" || error.code === "22023" || error.code === "22001") {
    return new CustomerDataError("Check the customer details and their allowed lengths.", "INVALID_CUSTOMER")
  }
  return new CustomerDataError(fallback, error.code)
}
