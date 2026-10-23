import { useRef } from 'react'
import { Outlet } from 'react-router-dom'
import { LoadingBar } from '../LoadingBar'
import { useApilarTablas } from '@/lib/apilarTablas'
import { PortalShell } from './PortalShell'

/** El portal de clientes visto desde la cuenta del administrador general: mismo marco y mismas pantallas, en otra ruta,
 * para comparar con la vista normal. No cambia nada del sistema ni de su cuenta. */
export function VistaClienteLayout() {
  const contenido = useRef<HTMLElement>(null)
  useApilarTablas(contenido)
  return (
    <>
      <LoadingBar />
      <PortalShell contenido={contenido} vistaPrevia>
        <Outlet />
      </PortalShell>
    </>
  )
}
