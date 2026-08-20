import { createBrowserRouter } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { RequireAdminGeneral, RequireAuth, RequireModulo, RequireTomaMuestras } from '@/features/auth'
import { ROUTES } from '@/constants/routes'
import { LoginView } from '@/views/login/LoginView'
import { DashboardView } from '@/views/dashboard/DashboardView'
import { TraceView } from '@/views/modules/trace/TraceView'
import { ConverterView } from '@/views/modules/converter/ConverterView'
import { IngestView } from '@/views/modules/ingest/IngestView'
import { ReporteView } from '@/views/modules/reports/ReporteView'
import { ReportesHubView } from '@/views/modules/reports/ReportesHubView'
import { PostVentaView } from '@/views/modules/reports/PostVentaView'
import { EmitirReporteHubView } from '@/views/modules/reports/EmitirReporteHubView'
import { CromatografiaEmitirView } from '@/views/modules/reports/cromatografia/CromatografiaEmitirView'
import { DataCoreView } from '@/views/modules/datacore/DataCoreView'
import { StorageView } from '@/views/modules/storage/StorageView'
import { SolicitudesView } from '@/views/modules/muestreo/SolicitudesView'
import { NuevaSolicitudView } from '@/views/modules/muestreo/NuevaSolicitudView'
import { MuestreoConfigView } from '@/views/modules/muestreo/MuestreoConfigView'
import { UsuariosView } from '@/views/admin/UsuariosView'
import { ListadosView } from '@/views/admin/ListadosView'
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
            children: [{ path: ROUTES.ingest, element: <IngestView /> }],
          },
          {
            element: <RequireModulo moduloId="reports" />,
            children: [
              { path: ROUTES.reports, element: <ReportesHubView /> },
              { path: ROUTES.reportsLaboratorio, element: <ReporteView /> },
              { path: ROUTES.reportsPostVenta, element: <PostVentaView /> },
              { path: ROUTES.reportsEmitir, element: <EmitirReporteHubView /> },
              { path: ROUTES.reportsEmitirCromatografia, element: <CromatografiaEmitirView /> },
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
            ],
          },
          {
            element: <RequireAdminGeneral />,
            children: [
              { path: ROUTES.adminUsuarios, element: <UsuariosView /> },
              { path: ROUTES.adminListados, element: <ListadosView /> },
              { path: ROUTES.tomaMuestrasConfig, element: <MuestreoConfigView /> },
            ],
          },
          { path: '*', element: <NotFoundView /> },
        ],
      },
    ],
  },
])
