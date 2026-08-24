import { Navigate, Outlet } from 'react-router-dom'
import { puedeVerReporte } from '@/features/usuarios'
import type { ReporteId } from '@/features/usuarios'
import { ROUTES } from '@/constants/routes'
import { useAuth } from '../hooks/useAuth'

/**
 * Entrar al módulo Report no alcanza para ver cualquier reporte: cada uno es de
 * un área. Un admin de Post Venta llega al hub y al histórico de Trace, pero no
 * a los datos de laboratorio de Cromatografía.
 */
export function RequireReporte({ reporte }: { reporte: ReporteId }) {
  const { user } = useAuth()
  if (!user || !puedeVerReporte(user, reporte)) return <Navigate to={ROUTES.reports} replace />
  return <Outlet />
}
