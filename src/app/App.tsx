import { RouterProvider } from 'react-router-dom'
import { SpeedInsights } from '@vercel/speed-insights/react'
import { AppProviders } from './providers/AppProviders'
import { router } from './router'

export function App() {
  return (
    <AppProviders>
      <RouterProvider router={router} />
      <SpeedInsights />
    </AppProviders>
  )
}
