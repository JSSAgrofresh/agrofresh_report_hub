import { Navigate, Outlet } from 'react-router-dom'
import { puedeVerSeccionLab } from '@/features/usuarios'
import type { LabSeccionId } from '@/features/usuarios'
import { ROUTES } from '@/constants/routes'
import { useAuth } from '../hooks/useAuth'

/** Una sección de AgroFresh Lab (Ingreso, Verificaciones o Envío): además del módulo, la cuenta
 * tiene que tener esa sección. Si no, vuelve al hub de AgroFresh Lab. */
export function RequireSeccionLab({ seccion }: { seccion: LabSeccionId }) {
  const { user } = useAuth()
  if (!user || !puedeVerSeccionLab(user, seccion)) return <Navigate to={ROUTES.agrofreshLab} replace />
  return <Outlet />
}
