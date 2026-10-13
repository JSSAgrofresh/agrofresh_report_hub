import { Navigate, Outlet } from 'react-router-dom'
import { tieneFuncion } from '@/features/usuarios'
import type { FuncionId } from '@/features/usuarios'
import { ROUTES } from '@/constants/routes'
import { useAuth } from '../hooks/useAuth'

/** Una «mini función» asignable (p. ej. editar los Criterios de las verificaciones): además del módulo, la cuenta
 * tiene que tenerla asignada. Si no, vuelve al hub de AgroFresh Lab. */
export function RequireFuncion({ funcion }: { funcion: FuncionId }) {
  const { user } = useAuth()
  if (!user || !tieneFuncion(user, funcion)) return <Navigate to={ROUTES.agrofreshLab} replace />
  return <Outlet />
}
