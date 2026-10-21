import { Navigate } from 'react-router-dom'
import { rutaDeInicioPortal } from '@/components/layout/portal/inicio'
import { useAuth } from '@/features/auth'
import { useMiDiseno } from '@/features/panelInicio'
import { vistaDeCliente } from '@/features/usuarios'
import { AdminGeneralDashboardView } from './AdminGeneralDashboardView'
import { AreaDashboardView } from './AreaDashboardView'
import { ClienteDashboardView } from './ClienteDashboardView'
import { PanelPersonalizado } from './PanelPersonalizado'

export function DashboardView() {
  const { user } = useAuth()
  // El administrador puede armar el Panel general por tipo de cuenta o por cuenta (Administración General →
  // Panel de inicio). Sin diseño propio —o si no se puede leer— cada cuenta ve su panel de siempre.
  const { cargando, piezas } = useMiDiseno()
  if (!user) return null
  // Clientes y comerciales aterrizan en sus gráficos (Report) y no en el Panel general.
  const inicioPortal = rutaDeInicioPortal(user)
  if (inicioPortal) return <Navigate to={inicioPortal} replace />
  if (cargando) return null

  if (piezas.length > 0) return <PanelPersonalizado usuario={user} piezas={piezas} />

  if (user.tipoAcceso === 'admin_general' || user.tipoAcceso === 'gerencia') return <AdminGeneralDashboardView />
  if (user.tipoAcceso === 'admin_area' && user.area) return <AreaDashboardView area={user.area} usuario={user} />
  if (user.tipoAcceso === 'comercial') return <ClienteDashboardView area="cromatografia" usuario={user} />
  if (user.tipoAcceso === 'cliente') {
    // Un cliente no tiene área propia: el encabezado se toma de lo que ve.
    const v = vistaDeCliente(user)
    const area = v.accutab && !v.report ? 'postventa' : 'cromatografia'
    return <ClienteDashboardView area={area} usuario={user} />
  }

  return null
}
