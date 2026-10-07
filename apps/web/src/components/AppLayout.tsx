import { Building2, Landmark, LogOut } from 'lucide-react'
import { NavLink, Outlet, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { useLogout } from '@/features/auth/api'
import { cn } from '@/lib/utils'

const nav = [{ to: '/companies', label: 'Firmalar', icon: Building2 }]

export function AppLayout() {
  const navigate = useNavigate()
  const logout = useLogout()

  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="focus:bg-card sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:px-3 focus:py-2"
      >
        Asosiy kontentga o'tish
      </a>
      <header className="bg-card border-b">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <div className="flex items-center gap-2 font-semibold">
            <span className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-md">
              <Landmark className="size-4" aria-hidden="true" />
            </span>
            <span className="hidden sm:inline">Moliyaviy yordam</span>
          </div>
          <nav aria-label="Asosiy menyu" className="flex flex-1 items-center gap-1">
            {nav.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    'flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors',
                    isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-secondary',
                  )
                }
              >
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </NavLink>
            ))}
          </nav>
          <Button
            variant="ghost"
            size="sm"
            className="h-9"
            disabled={logout.isPending}
            onClick={() => logout.mutate(undefined, { onSettled: () => navigate('/login', { replace: true }) })}
          >
            <LogOut aria-hidden="true" />
            Chiqish
          </Button>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
