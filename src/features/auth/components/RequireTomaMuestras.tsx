import { Navigate, Outlet } from 'react-router-dom'
import { puedeVerTomaMuestras } from '@/features/usuarios'
import { ROUTES } from '@/constants/routes'
import { useAuth } from '../hooks/useAuth'

export function RequireTomaMuestras() {
  const { user } = useAuth()
  if (!user || !puedeVerTomaMuestras(user)) return <Navigate to={ROUTES.dashboard} replace />
  return <Outlet />
}
