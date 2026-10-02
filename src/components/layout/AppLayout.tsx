import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { MobileTopbar } from './MobileTopbar'
import { LoadingBar } from './LoadingBar'
import { avisarVisita } from '@/features/adminPanel'
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
  const esCliente = user?.tipoAcceso === 'cliente'
  useEffect(() => {
    if (!user || esCliente) return
    avisarVisita(pathname).catch(() => undefined)
  }, [pathname, user, esCliente])

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
