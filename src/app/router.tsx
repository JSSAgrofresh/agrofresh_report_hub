import { createBrowserRouter } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { RequireAdminGeneral, RequireAuth, RequireModulo } from '@/features/auth'
import { ROUTES } from '@/constants/routes'
import { LoginView } from '@/views/login/LoginView'
import { DashboardView } from '@/views/dashboard/DashboardView'
import { TraceView } from '@/views/modules/trace/TraceView'
import { ConverterView } from '@/views/modules/converter/ConverterView'
import { IngestView } from '@/views/modules/ingest/IngestView'
import { ReportsComingSoonView } from '@/views/modules/reports/ReportsComingSoonView'
import { UsuariosView } from '@/views/admin/UsuariosView'
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
          { path: ROUTES.reports, element: <ReportsComingSoonView /> },
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
            element: <RequireAdminGeneral />,
            children: [{ path: ROUTES.adminUsuarios, element: <UsuariosView /> }],
          },
          { path: '*', element: <NotFoundView /> },
        ],
      },
    ],
  },
])
