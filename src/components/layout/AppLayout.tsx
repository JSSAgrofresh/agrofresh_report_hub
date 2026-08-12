import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { MobileTopbar } from './MobileTopbar'
import { LoadingBar } from './LoadingBar'
import styles from './AppLayout.module.css'

export function AppLayout() {
  const [menuAbierto, setMenuAbierto] = useState(false)

  return (
    <div className={styles.shell}>
      <LoadingBar />
      <MobileTopbar onAbrirMenu={() => setMenuAbierto(true)} />
      <div className={styles.cuerpo}>
        <Sidebar abierto={menuAbierto} onCerrar={() => setMenuAbierto(false)} />
        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
