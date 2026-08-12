import { NavLink } from 'react-router-dom'
import agrofreshLogo from '@/assets/agrofresh-logo.png'
import { useAuth } from '@/features/auth'
import { ROUTES } from '@/constants/routes'
import { MODULOS } from '@/constants/modules'
import { cn } from '@/lib/cn'
import { Badge } from '@/components/ui/Badge'
import styles from './Sidebar.module.css'

const ESTADO_LABEL: Record<string, string> = {
  en_preparacion: 'En preparación',
  proximamente: 'Próximamente',
}

interface SidebarProps {
  abierto: boolean
  onCerrar: () => void
}

export function Sidebar({ abierto, onCerrar }: SidebarProps) {
  const { user, logout } = useAuth()

  return (
    <>
      {abierto && <div className={styles.overlay} onClick={onCerrar} />}
      <aside className={cn(styles.sidebar, abierto && styles.abierto)}>
        <div className={styles.brand}>
          <img src={agrofreshLogo} alt="AgroFresh" className={styles.logo} />
        </div>

        <nav className={styles.nav}>
          <NavLink
            to={ROUTES.dashboard}
            end
            onClick={onCerrar}
            className={({ isActive }) => cn(styles.navLink, isActive && styles.navLinkActive)}
          >
            Panel general
          </NavLink>
          {MODULOS.map((m) =>
            m.estado === 'disponible' ? (
              <NavLink
                key={m.id}
                to={m.ruta}
                onClick={onCerrar}
                className={({ isActive }) => cn(styles.navLink, isActive && styles.navLinkActive)}
              >
                {m.nombre}
              </NavLink>
            ) : (
              <span key={m.id} className={cn(styles.navLink, styles.navLinkDeshabilitado)}>
                {m.nombre}
                <Badge tone="neutral">{ESTADO_LABEL[m.estado]}</Badge>
              </span>
            ),
          )}
        </nav>

        <div className={styles.pie}>
          <div className={styles.estadoBd}>
            <i className={styles.puntoBd} />
            Base de datos: pendiente
          </div>
          {user && (
            <div className={styles.usuario}>
              <div className={styles.usuarioInfo}>
                <span className={styles.usuarioNombre}>{user.nombre}</span>
                <span className={styles.usuarioRol}>{user.rol}</span>
              </div>
              <button className={styles.salir} onClick={() => logout()} title="Cerrar sesión">
                Salir
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
