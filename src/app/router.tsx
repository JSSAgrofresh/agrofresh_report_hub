import { createBrowserRouter } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { RequireAdminGeneral, RequireAuth, RequireModulo, RequireReporte, RequireTomaMuestras } from '@/features/auth'
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
            children: [{ path: ROUTES.ingest, element: <IngestView /> }],
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
              {
                element: <RequireReporte reporte="emitir" />,
                children: [
                  { path: ROUTES.reportsEmitir, element: <EmitirReporteHubView /> },
                  { path: ROUTES.reportsEmitirCromatografia, element: <CromatografiaEmitirView /> },
                ],
              },
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
