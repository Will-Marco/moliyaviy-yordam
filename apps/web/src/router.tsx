import { createBrowserRouter, Navigate } from 'react-router'
import { AppLayout } from '@/components/AppLayout'
import { LoginPage } from '@/features/auth/LoginPage'
import { RequireAuth } from '@/features/auth/RequireAuth'
import { CompaniesPage } from '@/features/companies/CompaniesPage'
import { ContractPage } from '@/features/contracts/ContractPage'
import { ContractsPage } from '@/features/contracts/ContractsPage'
import { InvoicesPage } from '@/features/invoices/InvoicesPage'

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <Navigate to="/contracts" replace /> },
          { path: '/contracts', element: <ContractsPage /> },
          { path: '/contracts/:id', element: <ContractPage /> },
          { path: '/invoices', element: <InvoicesPage /> },
          { path: '/companies', element: <CompaniesPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])

