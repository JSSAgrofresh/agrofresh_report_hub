import { Navigate, Outlet } from 'react-router-dom'
import { esAdminGeneral } from '@/features/usuarios'
import { ROUTES } from '@/constants/routes'
import { useAuth } from '../hooks/useAuth'

export function RequireAdminGeneral() {
  const { user } = useAuth()
  if (!user || !esAdminGeneral(user)) return <Navigate to={ROUTES.dashboard} replace />
  return <Outlet />
}
