import { useRef, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { MobileTopbar } from './MobileTopbar'
import { LoadingBar } from './LoadingBar'
import { useApilarTablas } from '@/lib/apilarTablas'
import styles from './AppLayout.module.css'

export function AppLayout() {
  const [menuAbierto, setMenuAbierto] = useState(false)
  const contenido = useRef<HTMLElement>(null)
  useApilarTablas(contenido)

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
