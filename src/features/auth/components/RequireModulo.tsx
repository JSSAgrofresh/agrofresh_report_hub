import { Navigate, Outlet } from 'react-router-dom'
import { puedeVerModulo } from '@/features/usuarios'
import { ROUTES } from '@/constants/routes'
import { useAuth } from '../hooks/useAuth'

export function RequireModulo({ moduloId }: { moduloId: string }) {
  const { user } = useAuth()
  if (!user || !puedeVerModulo(user, moduloId)) return <Navigate to={ROUTES.dashboard} replace />
  return <Outlet />
}
