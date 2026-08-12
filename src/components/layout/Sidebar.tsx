import type { ComponentType, SVGProps } from 'react'
import { NavLink } from 'react-router-dom'
import agrofreshLogo from '@/assets/agrofresh-logo.png'
import { useAuth } from '@/features/auth'
import { ROUTES } from '@/constants/routes'
import { MODULOS } from '@/constants/modules'
import { cn } from '@/lib/cn'
import { Badge } from '@/components/ui/Badge'
import {
  IconAudit,
  IconConverter,
  IconDatabase,
  IconLogout,
  IconPanel,
  IconReports,
  IconTrace,
  IconUser,
} from '@/components/ui/icons'
import styles from './Sidebar.module.css'

const ESTADO_LABEL: Record<string, string> = {
  en_preparacion: 'En preparación',
  proximamente: 'Próximamente',
}

const ICONO_MODULO: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  audit: IconAudit,
  trace: IconTrace,
  converter: IconConverter,
  reports: IconReports,
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
            <IconPanel className={styles.navIcono} />
            Panel general
          </NavLink>
          {MODULOS.map((m) => {
            const Icono = ICONO_MODULO[m.id]
            return m.estado === 'disponible' ? (
              <NavLink
                key={m.id}
                to={m.ruta}
                onClick={onCerrar}
                className={({ isActive }) => cn(styles.navLink, isActive && styles.navLinkActive)}
              >
                <Icono className={styles.navIcono} />
                {m.nombre}
              </NavLink>
            ) : (
              <span key={m.id} className={cn(styles.navLink, styles.navLinkDeshabilitado)}>
                <Icono className={styles.navIcono} />
                {m.nombre}
                <Badge tone="neutral">{ESTADO_LABEL[m.estado]}</Badge>
              </span>
            )
          })}
        </nav>

        <div className={styles.pie}>
          <div className={styles.estadoBd}>
            <IconDatabase className={styles.estadoBdIcono} />
            Base de datos: pendiente
          </div>
          {user && (
            <div className={styles.usuario}>
              <div className={styles.usuarioAvatar}>
                <IconUser />
              </div>
              <div className={styles.usuarioInfo}>
                <span className={styles.usuarioNombre}>{user.nombre}</span>
                <span className={styles.usuarioRol}>{user.rol}</span>
              </div>
              <button className={styles.salir} onClick={() => logout()} title="Cerrar sesión">
                <IconLogout />
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
