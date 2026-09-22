import { createBrowserRouter } from "react-router-dom"

import { AppShell } from "@/components/layout/app-shell"
import { PublicOnly, RequireAuth } from "@/features/auth/route-guards"
import { DashboardPage } from "@/pages/dashboard-page"
import { HomePage } from "@/pages/home-page"
import { LoginPage } from "@/pages/login-page"
import { NotFoundPage } from "@/pages/not-found-page"
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
        children: [{ path: "/dashboard", element: <DashboardPage /> }],
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
] satisfies Parameters<typeof createBrowserRouter>[0]

export const router = createBrowserRouter(routes)
