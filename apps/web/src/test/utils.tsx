import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'

type Handler = (init: RequestInit | undefined) => { status: number; body?: unknown }

/** Stubs global fetch; keys are "METHOD /path". Unmatched requests fail the test loudly. */
export function mockApi(routes: Record<string, Handler>) {
  const calls: { method: string; path: string; body: unknown }[] = []
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase()
    const path = typeof input === 'string' ? input : input.toString()
    calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    const handler = routes[`${method} ${path}`]
    if (!handler) throw new Error(`Unexpected request: ${method} ${path}`)
    const { status, body } = handler(init)
    return new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  return { calls }
}

export function renderWithProviders(ui: ReactElement, { route = '/', path = '*' } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path={path} element={ui} />
          <Route path="/login" element={<div>LOGIN PAGE</div>} />
          <Route path="/companies" element={<div>COMPANIES PAGE</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
