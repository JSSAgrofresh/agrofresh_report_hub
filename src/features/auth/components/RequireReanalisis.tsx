import { Navigate, Outlet } from 'react-router-dom'
import { puedeCrearReanalisis } from '@/features/usuarios'
import { ROUTES } from '@/constants/routes'
import { useAuth } from '../hooks/useAuth'

export function RequireReanalisis() {
  const { user } = useAuth()
  if (!user || !puedeCrearReanalisis(user)) return <Navigate to={ROUTES.dashboard} replace />
  return <Outlet />
}
