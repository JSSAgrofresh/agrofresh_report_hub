import { Navigate, Outlet } from 'react-router-dom'
import { ROUTES } from '@/constants/routes'
import { useAuth } from '../hooks/useAuth'

/** Pantallas de escritura o de datos sin acotar a plantas: un comercial (solo lectura, solo lo de sus plantas) vuelve
 * a `redirigirA` (por defecto, su panel de inicio). El servidor igual le responde 403. */
export function RequireNoComercial({ redirigirA = ROUTES.dashboard }: { redirigirA?: string }) {
  const { user } = useAuth()
  if (user?.tipoAcceso === 'comercial') return <Navigate to={redirigirA} replace />
  return <Outlet />
}
