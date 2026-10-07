import { AlertCircle } from 'lucide-react'
import { Navigate } from 'react-router'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { isUnauthorized } from '@/lib/api'

/** Expired session → login; anything else → message with retry. */
export function QueryErrorState({ error, onRetry }: { error: Error; onRetry: () => void }) {
  if (isUnauthorized(error)) return <Navigate to="/login" replace />
  return (
    <Alert variant="destructive" role="alert">
      <AlertCircle />
      <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
        <span>{error.message}</span>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Qayta urinish
        </Button>
      </AlertDescription>
    </Alert>
  )
}
