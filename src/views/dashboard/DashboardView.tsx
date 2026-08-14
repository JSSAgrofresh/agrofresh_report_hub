import { useAuth } from '@/features/auth'
import { AdminGeneralDashboardView } from './AdminGeneralDashboardView'
import { AreaDashboardView } from './AreaDashboardView'
import { ClienteDashboardView } from './ClienteDashboardView'

export function DashboardView() {
  const { user } = useAuth()
  if (!user) return null

  if (user.tipoAcceso === 'admin_general') return <AdminGeneralDashboardView />
  if (user.tipoAcceso === 'admin_area' && user.area) return <AreaDashboardView area={user.area} usuario={user} />
  if (user.tipoAcceso === 'cliente' && user.area) return <ClienteDashboardView area={user.area} usuario={user} />

  return null
}
