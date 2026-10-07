import { zodResolver } from '@hookform/resolvers/zod'
import { Landmark, LoaderCircle } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { z } from 'zod'
import { FormField } from '@/components/FormField'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { describedBy } from '@/lib/form'
import { useLogin } from './api'

const schema = z.object({
  username: z.string().trim().min(1, 'Login kiritilmagan'),
  password: z.string().min(1, 'Parol kiritilmagan'),
})
type LoginForm = z.infer<typeof schema>

export function LoginPage() {
  const navigate = useNavigate()
  const login = useLogin()
  const { register, handleSubmit, formState } = useForm<LoginForm>({
    resolver: zodResolver(schema),
    defaultValues: { username: '', password: '' },
  })
  const { errors } = formState

  const onSubmit = handleSubmit((values) =>
    login.mutate(values, { onSuccess: () => navigate('/contracts', { replace: true }) }),
  )

  return (
    <main className="bg-background flex min-h-dvh items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="bg-primary text-primary-foreground mb-2 flex size-10 items-center justify-center rounded-lg">
            <Landmark className="size-5" aria-hidden="true" />
          </div>
          <CardTitle className="text-xl">Moliyaviy yordam</CardTitle>
          <CardDescription>Foiz hisobi tizimiga kirish</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} noValidate className="grid gap-4">
            {login.error && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{login.error.message}</AlertDescription>
              </Alert>
            )}
            <FormField id="username" label="Login" error={errors.username?.message}>
              <Input
                id="username"
                autoComplete="username"
                autoFocus
                aria-invalid={!!errors.username}
                aria-describedby={describedBy('username', errors.username?.message)}
                {...register('username')}
              />
            </FormField>
            <FormField id="password" label="Parol" error={errors.password?.message}>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                aria-invalid={!!errors.password}
                aria-describedby={describedBy('password', errors.password?.message)}
                {...register('password')}
              />
            </FormField>
            <Button type="submit" className="h-10" disabled={login.isPending}>
              {login.isPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
              Kirish
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
