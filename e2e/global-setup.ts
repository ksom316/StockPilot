import { createClient } from "@supabase/supabase-js"

export default async function globalSetup() {
  const email = process.env.STOCKPILOT_E2E_EMAIL?.trim()
  const password = process.env.STOCKPILOT_E2E_PASSWORD
  const serviceRoleKey = process.env.STOCKPILOT_E2E_SERVICE_ROLE_KEY?.trim()
  const url = process.env.STOCKPILOT_E2E_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "http://127.0.0.1:54321"

  if (!email || !password || !serviceRoleKey) {
    throw new Error("E2E requires STOCKPILOT_E2E_EMAIL, STOCKPILOT_E2E_PASSWORD, and STOCKPILOT_E2E_SERVICE_ROLE_KEY for a dedicated local Supabase user.")
  }

  const admin = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (users.error) throw new Error(`Could not inspect the local E2E user: ${users.error.message}`)

  const existing = users.data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase())
  const metadata = { display_name: "StockPilot E2E Owner" }
  const result = existing
    ? await admin.auth.admin.updateUserById(existing.id, { email_confirm: true, password, user_metadata: metadata })
    : await admin.auth.admin.createUser({ email, email_confirm: true, password, user_metadata: metadata })

  if (result.error) throw new Error(`Could not prepare the local E2E user: ${result.error.message}`)
}
