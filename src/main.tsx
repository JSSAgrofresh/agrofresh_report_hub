import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/app/App'
import '@/styles/globals.css'
import '@/lib/graficosNitidos'
import { registrarServiceWorker } from '@/lib/pwa'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)


registrarServiceWorker()
