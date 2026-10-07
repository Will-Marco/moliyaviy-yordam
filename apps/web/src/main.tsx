import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from '@/components/ui/sonner'
import { createQueryClient } from '@/lib/queryClient'
import { RouterProvider } from 'react-router'
import { router } from './router'
import './index.css'

const queryClient = createQueryClient({
  onUnauthorized: () => {
    // A wrong password on /login is also a 401 — leave that page and its error alone.
    if (router.state.location.pathname === '/login') return
    queryClient.clear()
    void router.navigate('/login', { replace: true })
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster theme="light" position="top-right" richColors />
    </QueryClientProvider>
  </StrictMode>,
)
