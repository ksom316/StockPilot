import { createBrowserRouter } from "react-router-dom"

import { AppShell } from "@/components/layout/app-shell"
import { OnboardingOnly, PublicOnly, RequireAuth, RequireBusiness, RequireFinance, RequireModule, RouteLoadingScreen } from "@/features/auth/route-guards"
import { DashboardPage } from "@/pages/dashboard-page"
import { HomePage } from "@/pages/home-page"
import { InventoryPage } from "@/pages/inventory-page"
import { InventoryMovementsPage } from "@/pages/inventory-movements-page"
import { LoginPage } from "@/pages/login-page"
import { ModuleSettingsPage } from "@/pages/module-settings-page"
import { NotFoundPage } from "@/pages/not-found-page"
import { OnboardingPage } from "@/pages/onboarding-page"
import { SignupPage } from "@/pages/signup-page"
import { SalesCheckoutPage } from "@/pages/sales-checkout-page"
import { SalesHistoryPage } from "@/pages/sales-history-page"
import { SaleDetailPage } from "@/pages/sale-detail-page"

export const routes = [
  {
    element: <AppShell />,
    children: [
      { path: "/", element: <HomePage /> },
      {
        element: <PublicOnly />,
        children: [
          { path: "/login", element: <LoginPage /> },
          { path: "/signup", element: <SignupPage /> },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <OnboardingOnly />,
            children: [{ path: "/onboarding", element: <OnboardingPage /> }],
          },
          {
            element: <RequireBusiness />,
            children: [
              { path: "/dashboard", element: <DashboardPage /> },
              { path: "/inventory", element: <InventoryPage /> },
              { path: "/inventory/movements", element: <InventoryMovementsPage /> },
              { path: "/settings/modules", element: <ModuleSettingsPage /> },
              { element: <RequireModule module="sales" />, children: [
                { path: "/sales", element: <SalesCheckoutPage /> },
                { path: "/sales/history", element: <SalesHistoryPage /> },
                { path: "/sales/:saleId", element: <SaleDetailPage /> },
              ] },
              { element: <RequireModule module="purchasing" allowedRoles={["owner", "manager", "employee"]} />, children: [
                { path: "/purchasing", lazy: async () => {
                  const module = await import("@/pages/purchasing-page")
                  return { Component: module.PurchasingPage, HydrateFallback: RouteLoadingScreen }
                } },
                { path: "/purchasing/suppliers", lazy: async () => { const module = await import("@/pages/purchasing-suppliers-page"); return { Component: module.PurchasingSuppliersPage, HydrateFallback: RouteLoadingScreen } } },
                { path: "/purchasing/history", lazy: async () => { const module = await import("@/pages/purchase-history-page"); return { Component: module.PurchaseHistoryPage, HydrateFallback: RouteLoadingScreen } } },
                { path: "/purchasing/:purchaseId", lazy: async () => { const module = await import("@/pages/purchase-detail-page"); return { Component: module.PurchaseDetailPage, HydrateFallback: RouteLoadingScreen } } },
              ] },
              { element: <RequireFinance />, children: [
                { path: "/finance/expenses", lazy: async () => { const module = await import("@/pages/finance-expenses-page"); return { Component: module.FinanceExpensesPage, HydrateFallback: RouteLoadingScreen } } },
              ] },
            ],
          },
        ],
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
] satisfies Parameters<typeof createBrowserRouter>[0]

export const router = createBrowserRouter(routes)
