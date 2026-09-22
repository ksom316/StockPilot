import { createBrowserRouter } from "react-router-dom"

import { AppShell } from "@/components/layout/app-shell"
import { OnboardingOnly, PublicOnly, RequireAuth, RequireBusiness } from "@/features/auth/route-guards"
import { DashboardPage } from "@/pages/dashboard-page"
import { HomePage } from "@/pages/home-page"
import { InventoryPage } from "@/pages/inventory-page"
import { InventoryMovementsPage } from "@/pages/inventory-movements-page"
import { LoginPage } from "@/pages/login-page"
import { ModuleSettingsPage } from "@/pages/module-settings-page"
import { NotFoundPage } from "@/pages/not-found-page"
import { OnboardingPage } from "@/pages/onboarding-page"
import { SignupPage } from "@/pages/signup-page"

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
            ],
          },
        ],
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
] satisfies Parameters<typeof createBrowserRouter>[0]

export const router = createBrowserRouter(routes)
