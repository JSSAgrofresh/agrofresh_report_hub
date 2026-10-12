import { useAuth } from '@/features/auth'
import { useMiDiseno } from '@/features/panelInicio'
import { AdminGeneralDashboardView } from './AdminGeneralDashboardView'
import { AreaDashboardView } from './AreaDashboardView'
import { ClienteDashboardView } from './ClienteDashboardView'
import { PanelPersonalizado } from './PanelPersonalizado'

export function DashboardView() {
  const { user } = useAuth()
  // El administrador puede armar el Panel general por tipo de cuenta o por cuenta (Administración General →
  // Panel de inicio). Sin diseño propio —o si no se puede leer— cada cuenta ve su panel de siempre.
  const { cargando, piezas } = useMiDiseno()
  if (!user || cargando) return null

  if (piezas.length > 0) return <PanelPersonalizado usuario={user} piezas={piezas} />

  if (user.tipoAcceso === 'admin_general' || user.tipoAcceso === 'gerencia') return <AdminGeneralDashboardView />
  if (user.tipoAcceso === 'admin_area' && user.area) return <AreaDashboardView area={user.area} usuario={user} />
  if (user.tipoAcceso === 'cliente' && user.area) return <ClienteDashboardView area={user.area} usuario={user} />

  return null
}
