import { Navigate, Outlet } from 'react-router-dom'
import { ROUTES } from '@/constants/routes'
import { useAuth } from '../hooks/useAuth'

export function RequireAuth() {
  const { user } = useAuth()
  if (!user) return <Navigate to={ROUTES.login} replace />
  return <Outlet />
}
