import { createBrowserRouter } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { ROUTES } from '@/constants/routes'
import { DashboardView } from '@/views/dashboard/DashboardView'
import { NotFoundView } from '@/views/not-found/NotFoundView'
import { ReportsView } from '@/views/reports/ReportsView'
import { SamplesView } from '@/views/samples/SamplesView'

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: ROUTES.dashboard, element: <DashboardView /> },
      { path: ROUTES.reports, element: <ReportsView /> },
      { path: ROUTES.samples, element: <SamplesView /> },
      { path: '*', element: <NotFoundView /> },
    ],
  },
])
