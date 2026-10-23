import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { MobileTopbar } from './MobileTopbar'
import { LoadingBar } from './LoadingBar'
import { PortalShell } from './portal/PortalShell'
import { useTemaCuenta } from './portal/tema'
import { avisarVisita } from '@/features/adminPanel'
import { enviarLatido } from '@/features/monitoreo'
import { useAuth } from '@/features/auth'
import { useApilarTablas } from '@/lib/apilarTablas'
import styles from './AppLayout.module.css'

export function AppLayout() {
  const [menuAbierto, setMenuAbierto] = useState(false)
  const contenido = useRef<HTMLElement>(null)
  useApilarTablas(contenido)

  // Cada pantalla que se abre queda anotada por módulo (el servidor no repite la
  // misma dentro de unos minutos). Las cuentas de cliente no se registran.
  const { pathname } = useLocation()
  const { user } = useAuth()
  const esCliente = user?.tipoAcceso === 'cliente' || user?.tipoAcceso === 'comercial' // sin acceso a la bitácora
  // El administrador puede dejar a un comercial con el marco interno de siempre (barra lateral) en vez del portal.
  const temaCuenta = useTemaCuenta(user?.id)
  const conPortal = esCliente && !(user?.tipoAcceso === 'comercial' && temaCuenta === 'clasico')
  useEffect(() => {
    if (!user || esCliente) return
    avisarVisita(pathname).catch(() => undefined)
  }, [pathname, user, esCliente])

  // «Sigo aquí»: un latido por minuto (y al cambiar de pantalla) mientras la pestaña está a la vista. Alimenta
  // «Gente conectada» del Monitoreo. Si falla no pasa nada.
  useEffect(() => {
    if (!user) return
    const latir = () => { if (!document.hidden) enviarLatido(pathname).catch(() => undefined) }
    latir()
    const cada = window.setInterval(latir, 60_000)
    document.addEventListener('visibilitychange', latir)
    return () => { window.clearInterval(cada); document.removeEventListener('visibilitychange', latir) }
  }, [pathname, user])

  // Clientes y comerciales ven el mismo contenido con otro marco: navbar flotante y fondo vivo, sin barra lateral.
  if (conPortal) {
    return (
      <>
        <LoadingBar />
        <PortalShell contenido={contenido}>
          <Outlet />
        </PortalShell>
      </>
    )
  }

  return (
    <div className={styles.shell}>
      <LoadingBar />
      <MobileTopbar onAbrirMenu={() => setMenuAbierto(true)} />
      <div className={styles.cuerpo}>
        <Sidebar abierto={menuAbierto} onCerrar={() => setMenuAbierto(false)} />
        <main className={styles.content} ref={contenido}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
