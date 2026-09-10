import { createBrowserRouter } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { RequireAdminGeneral, RequireAuth, RequireModulo, RequireReporte, RequireTomaMuestras } from '@/features/auth'
import { ROUTES } from '@/constants/routes'
import { LoginView } from '@/views/login/LoginView'
import { DashboardView } from '@/views/dashboard/DashboardView'
import { TraceView } from '@/views/modules/trace/TraceView'
import { ConverterView } from '@/views/modules/converter/ConverterView'
import { CargarDatosView } from '@/views/modules/cargar-datos/CargarDatosView'
import { ReporteView } from '@/views/modules/reports/ReporteView'
import { ReportesHubView } from '@/views/modules/reports/ReportesHubView'
import { PostVentaView } from '@/views/modules/reports/PostVentaView'
import { AgrofreshLabView } from '@/views/modules/lab/AgrofreshLabView'
import { AgrofreshLabHubView } from '@/views/modules/lab/AgrofreshLabHubView'
import { VerificacionesView } from '@/views/modules/lab/verificaciones/VerificacionesView'
import { VerificacionesHistoricoView } from '@/views/modules/lab/verificaciones/VerificacionesHistoricoView'
import { CriteriosView } from '@/views/modules/lab/verificaciones/CriteriosView'
import { DataCoreView } from '@/views/modules/datacore/DataCoreView'
import { StorageView } from '@/views/modules/storage/StorageView'
import { SolicitudesView } from '@/views/modules/muestreo/SolicitudesView'
import { NuevaSolicitudView } from '@/views/modules/muestreo/NuevaSolicitudView'
import { MuestreoConfigView } from '@/views/modules/muestreo/MuestreoConfigView'
import { SolicitudDetalleView } from '@/views/modules/muestreo/SolicitudDetalleView'
import { UsuariosView } from '@/views/admin/UsuariosView'
import { ListadosView } from '@/views/admin/ListadosView'
import { LaboratoriosView } from '@/views/admin/laboratorios/LaboratoriosView'
import { NotFoundView } from '@/views/not-found/NotFoundView'

export const router = createBrowserRouter([
  { path: ROUTES.login, element: <LoginView /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: ROUTES.dashboard, element: <DashboardView /> },
          {
            element: <RequireModulo moduloId="trace" />,
            children: [{ path: ROUTES.trace, element: <TraceView /> }],
          },
          {
            element: <RequireModulo moduloId="converter" />,
            children: [{ path: ROUTES.converter, element: <ConverterView /> }],
          },
          {
            element: <RequireModulo moduloId="ingest" />,
            children: [{ path: ROUTES.ingest, element: <CargarDatosView /> }],
          },
          {
            element: <RequireModulo moduloId="reports" />,
            children: [
              { path: ROUTES.reports, element: <ReportesHubView /> },
              // Cada reporte es de un área: el hub es común, el contenido no.
              {
                element: <RequireReporte reporte="laboratorio" />,
                children: [{ path: ROUTES.reportsLaboratorio, element: <ReporteView /> }],
              },
              {
                element: <RequireReporte reporte="postventa" />,
                children: [{ path: ROUTES.reportsPostVenta, element: <PostVentaView /> }],
              },
            ],
          },
          {
            element: <RequireModulo moduloId="agrofresh_lab" />,
            children: [
              // El hub es la puerta; los dos módulos de adentro comparten el
              // mismo permiso, igual que las tarjetas del hub de Report.
              { path: ROUTES.agrofreshLab, element: <AgrofreshLabHubView /> },
              { path: ROUTES.agrofreshLabIngreso, element: <AgrofreshLabView /> },
              { path: ROUTES.agrofreshLabVerificaciones, element: <VerificacionesView /> },
              {
                path: ROUTES.agrofreshLabVerificacionesHistorico,
                element: <VerificacionesHistoricoView />,
              },
              { path: ROUTES.agrofreshLabVerificacionesCriterios, element: <CriteriosView /> },
            ],
          },
          {
            element: <RequireModulo moduloId="datacore" />,
            children: [{ path: ROUTES.datacore, element: <DataCoreView /> }],
          },
          {
            element: <RequireModulo moduloId="storage" />,
            children: [{ path: ROUTES.storage, element: <StorageView /> }],
          },
          {
            element: <RequireTomaMuestras />,
            children: [
              { path: ROUTES.tomaMuestras, element: <SolicitudesView /> },
              { path: ROUTES.tomaMuestrasNueva, element: <NuevaSolicitudView /> },
              { path: ROUTES.tomaMuestrasEditar, element: <NuevaSolicitudView modo="editar" /> },
              { path: ROUTES.tomaMuestrasDetalle, element: <SolicitudDetalleView /> },
            ],
          },
          {
            element: <RequireAdminGeneral />,
            children: [
              { path: ROUTES.adminUsuarios, element: <UsuariosView /> },
              { path: ROUTES.adminListados, element: <ListadosView /> },
              { path: ROUTES.adminLaboratorios, element: <LaboratoriosView /> },
              { path: ROUTES.tomaMuestrasConfig, element: <MuestreoConfigView /> },
            ],
          },
          { path: '*', element: <NotFoundView /> },
        ],
      },
    ],
  },
])
