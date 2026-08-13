import type { ComponentType, CSSProperties, SVGProps } from 'react'
import { NavLink } from 'react-router-dom'
import agrofreshLogo from '@/assets/agrofresh-logo.png'
import { useAuth } from '@/features/auth'
import { AREAS } from '@/constants/areas'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/lib/cn'
import { etiquetaAcceso, modulosPermitidos, puedeAdministrarUsuarios } from '@/features/usuarios'
import {
  IconAudit,
  IconConverter,
  IconDatabase,
  IconLogout,
  IconPanel,
  IconReports,
  IconTrace,
  IconUser,
  IconUsers,
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
  if (!user) return null

  const modulos = modulosPermitidos(user)
  const esAdmin = puedeAdministrarUsuarios(user)
  const acento = user.area ? AREAS[user.area].colorPrimario : undefined
  const estiloSidebar = acento ? ({ '--acento-usuario': acento } as CSSProperties) : undefined

  return (
    <>
      {abierto && <div className={styles.overlay} onClick={onCerrar} />}
      <aside className={cn(styles.sidebar, abierto && styles.abierto)} style={estiloSidebar}>
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

          {modulos.length > 0 && (
            <>
              <p className={styles.seccion}>Funciones</p>
              {modulos.map((m) => {
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
                    <span className={styles.estadoPill}>{ESTADO_LABEL[m.estado]}</span>
                  </span>
                )
              })}
            </>
          )}

          {esAdmin && (
            <>
              <p className={styles.seccion}>Administración</p>
              <NavLink
                to={ROUTES.adminUsuarios}
                onClick={onCerrar}
                className={({ isActive }) => cn(styles.navLink, isActive && styles.navLinkActive)}
              >
                <IconUsers className={styles.navIcono} />
                Usuarios
              </NavLink>
            </>
          )}
        </nav>

        <div className={styles.pie}>
          <div className={styles.estadoBd}>
            <IconDatabase className={styles.estadoBdIcono} />
            Base de datos: pendiente
          </div>
          <div className={styles.usuario}>
            <div className={styles.usuarioAvatar}>
              <IconUser />
            </div>
            <div className={styles.usuarioInfo}>
              <span className={styles.usuarioNombre}>{user.nombre}</span>
              <span className={styles.usuarioRol}>{etiquetaAcceso(user)}</span>
            </div>
            <button className={styles.salir} onClick={() => logout()} title="Cerrar sesión">
              <IconLogout />
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
