export const optionalModules = [
  { key: "sales", label: "Sales", description: "Record sales and automatically reduce stock." },
  { key: "purchasing", label: "Purchasing", description: "Record purchases and restocking to increase stock." },
  { key: "expenses", label: "Expenses & Profitability", description: "Manage sensitive operating expenses and estimated financial performance." },
  { key: "customers", label: "Customers", description: "Keep customer records and purchase history." },
  { key: "analytics", label: "Analytics", description: "Explore deeper business performance and trends." },
  { key: "smart_insights", label: "Smart Insights", description: "Receive intelligent inventory and business recommendations." },
  { key: "team", label: "Team", description: "Add employees and manage permissions." },
] as const

export type OptionalModule = (typeof optionalModules)[number]["key"]

export function getModuleLabel(module: OptionalModule) {
  return optionalModules.find((item) => item.key === module)?.label ?? module
}
