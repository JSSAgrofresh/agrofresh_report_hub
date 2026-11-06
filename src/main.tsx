import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/app/App'
import '@/styles/globals.css'
import '@/styles/mejoras-visuales-oscuro.css'
import '@/styles/mejoras-visuales.css'
import { aplicarTemaGuardado } from '@/lib/temaVisual'
import '@/lib/graficosNitidos'
import { registrarServiceWorker } from '@/lib/pwa'

aplicarTemaGuardado()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)


registrarServiceWorker()
