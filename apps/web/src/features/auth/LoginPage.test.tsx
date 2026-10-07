import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockApi, renderWithProviders } from '@/test/utils'
import { LoginPage } from './LoginPage'

describe('LoginPage', () => {
  it('requires both fields before submitting', async () => {
    const { calls } = mockApi({})
    renderWithProviders(<LoginPage />)
    await userEvent.click(screen.getByRole('button', { name: 'Kirish' }))
    expect(await screen.findByText('Login kiritilmagan')).toBeInTheDocument()
    expect(screen.getByText('Parol kiritilmagan')).toBeInTheDocument()
    expect(calls).toHaveLength(0)
  })

  it('shows the server error on wrong credentials', async () => {
    mockApi({
      'POST /api/auth/login': () => ({ status: 401, body: { message: "Login yoki parol noto'g'ri" } }),
    })
    renderWithProviders(<LoginPage />)
    await userEvent.type(screen.getByLabelText('Login'), 'admin')
    await userEvent.type(screen.getByLabelText('Parol'), 'wrong')
    await userEvent.click(screen.getByRole('button', { name: 'Kirish' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("Login yoki parol noto'g'ri")
  })

  it('goes to the contracts page after a successful login', async () => {
    const { calls } = mockApi({
      'POST /api/auth/login': () => ({ status: 200, body: { username: 'admin' } }),
    })
    renderWithProviders(<LoginPage />, { route: '/login-form' })
    await userEvent.type(screen.getByLabelText('Login'), 'admin')
    await userEvent.type(screen.getByLabelText('Parol'), 'secret')
    await userEvent.click(screen.getByRole('button', { name: 'Kirish' }))
    expect(await screen.findByText('CONTRACTS PAGE')).toBeInTheDocument()
    expect(calls[0].body).toEqual({ username: 'admin', password: 'secret' })
  })
})
