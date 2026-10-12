import { createBrowserRouter, Navigate } from 'react-router'
import { AppLayout } from '@/components/AppLayout'
import { LoginPage } from '@/features/auth/LoginPage'
import { RequireAuth } from '@/features/auth/RequireAuth'

// Pages load on first visit (one chunk each); login and the app shell stay in the entry bundle.
export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <Navigate to="/contracts" replace /> },
          {
            path: '/contracts',
            lazy: async () => ({ Component: (await import('@/features/contracts/ContractsPage')).ContractsPage }),
          },
          {
            path: '/contracts/:id',
            lazy: async () => ({ Component: (await import('@/features/contracts/ContractPage')).ContractPage }),
          },
          {
            path: '/invoices',
            lazy: async () => ({ Component: (await import('@/features/invoices/InvoicesPage')).InvoicesPage }),
          },
          {
            path: '/companies',
            lazy: async () => ({ Component: (await import('@/features/companies/CompaniesPage')).CompaniesPage }),
          },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
