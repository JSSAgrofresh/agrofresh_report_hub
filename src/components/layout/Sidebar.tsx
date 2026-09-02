import { useEffect, useState } from 'react'
import type { ComponentType, CSSProperties, SVGProps } from 'react'
import { NavLink } from 'react-router-dom'
import agrofreshLogo from '@/assets/agrofresh-logo.png'
import { useAuth } from '@/features/auth'
import { AREAS } from '@/constants/areas'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/lib/cn'
import {
  etiquetaAcceso,
  modulosPermitidos,
  puedeAdministrarUsuarios,
  puedeVerTomaMuestras,
} from '@/features/usuarios'
import {
  IconConverter,
  IconDatabase,
  IconDataCore,
  IconEmitir,
  IconFrasco,
  IconIngest,
  IconListados,
  IconLogout,
  IconPanel,
  IconPanelLateral,
  IconReports,
  IconStorage,
  IconTrace,
  IconUser,
  IconUsers,
} from '@/components/ui/icons'
import styles from './Sidebar.module.css'

/** Plegada, la barra deja solo los iconos. La elección se recuerda: quien
 *  trabaja todo el día en el laboratorio no quiere volver a plegarla en cada
 *  carga. Es una preferencia de esta pantalla, no un dato del sistema, así
 *  que vive en el navegador. */
const CLAVE_COLAPSO = 'agrofresh.sidebar.colapsada.v1'

function leerColapso(): boolean {
  try {
    return localStorage.getItem(CLAVE_COLAPSO) === '1'
  } catch {
    // Modo privado o cookies bloqueadas: se abre desplegada, que es el
    // comportamiento de siempre.
    return false
  }
}

const ESTADO_LABEL: Record<string, string> = {
  en_preparacion: 'En preparación',
  proximamente: 'Próximamente',
}

const ICONO_MODULO: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  datacore: IconDataCore,
  trace: IconTrace,
  converter: IconConverter,
  ingest: IconIngest,
  reports: IconReports,
  agrofresh_lab: IconFrasco,
  storage: IconStorage,
}

interface SidebarProps {
  abierto: boolean
  onCerrar: () => void
}

export function Sidebar({ abierto, onCerrar }: SidebarProps) {
  const { user, logout } = useAuth()
  const [colapsada, setColapsada] = useState(leerColapso)

  // Con el menú abierto encima, arrastrar el dedo movía la página de atrás:
  // se veía el contenido desplazándose bajo un menú que parecía trabado. Solo
  // pasa en el teléfono, que es donde el menú es un cajón; en escritorio
  // `abierto` nunca se enciende.
  useEffect(() => {
    if (!abierto) return
    const previo = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previo
    }
  }, [abierto])

  if (!user) return null

  function alternarColapso() {
    setColapsada((previa) => {
      const nueva = !previa
      try {
        localStorage.setItem(CLAVE_COLAPSO, nueva ? '1' : '0')
      } catch {
        // Que no se pueda recordar no impide plegarla ahora.
      }
      return nueva
    })
  }

  const modulos = modulosPermitidos(user)
  const esAdmin = puedeAdministrarUsuarios(user)
  const veTomaMuestras = puedeVerTomaMuestras(user)
  const acento = user.area ? AREAS[user.area].colorPrimario : undefined
  const estiloSidebar = acento ? ({ '--acento-usuario': acento } as CSSProperties) : undefined

  return (
    <>
      {abierto && <div className={styles.overlay} onClick={onCerrar} />}
      <aside
        className={cn(styles.sidebar, abierto && styles.abierto, colapsada && styles.colapsada)}
        style={estiloSidebar}
      >
        <div className={styles.brand}>
          <span className={styles.marco}>
            <img src={agrofreshLogo} alt="AgroFresh" className={styles.logo} />
          </span>
          <button
            type="button"
            className={styles.plegar}
            onClick={alternarColapso}
            aria-expanded={!colapsada}
            aria-label={colapsada ? 'Desplegar el menú' : 'Plegar el menú'}
            title={colapsada ? 'Desplegar el menú' : 'Plegar el menú'}
          >
            <IconPanelLateral />
          </button>
        </div>

        <nav className={styles.nav}>
          <NavLink
            to={ROUTES.dashboard}
            title="Panel general"
            end
            onClick={onCerrar}
            className={({ isActive }) => cn(styles.navLink, isActive && styles.navLinkActive)}
          >
            <IconPanel className={styles.navIcono} />
            <span className={styles.etiqueta}>Panel general</span>
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
                    title={m.nombre}
                    onClick={onCerrar}
                    className={({ isActive }) => cn(styles.navLink, isActive && styles.navLinkActive)}
                  >
                    <Icono className={styles.navIcono} />
                    <span className={styles.etiqueta}>{m.nombre}</span>
                  </NavLink>
                ) : (
                  <span
                    key={m.id}
                    className={cn(styles.navLink, styles.navLinkDeshabilitado)}
                    title={`${m.nombre} — ${ESTADO_LABEL[m.estado]}`}
                  >
                    <Icono className={styles.navIcono} />
                    <span className={styles.etiqueta}>{m.nombre}</span>
                    <span className={styles.estadoPill}>{ESTADO_LABEL[m.estado]}</span>
                  </span>
                )
              })}
            </>
          )}

          {veTomaMuestras && (
            <>
              <p className={styles.seccion}>Toma de muestras</p>
              <NavLink
                to={ROUTES.tomaMuestras}
                title="Solicitudes"
                end
                onClick={onCerrar}
                className={({ isActive }) => cn(styles.navLink, isActive && styles.navLinkActive)}
              >
                <IconFrasco className={styles.navIcono} />
                <span className={styles.etiqueta}>Solicitudes</span>
              </NavLink>
              <NavLink
                to={ROUTES.tomaMuestrasNueva}
                title="Nueva solicitud"
                onClick={onCerrar}
                className={({ isActive }) => cn(styles.navLink, isActive && styles.navLinkActive)}
              >
                <IconEmitir className={styles.navIcono} />
                <span className={styles.etiqueta}>Nueva solicitud</span>
              </NavLink>
            </>
          )}

          {esAdmin && (
            <>
              <p className={styles.seccion}>Administración</p>
              <NavLink
                to={ROUTES.adminUsuarios}
                title="Usuarios"
                onClick={onCerrar}
                className={({ isActive }) => cn(styles.navLink, isActive && styles.navLinkActive)}
              >
                <IconUsers className={styles.navIcono} />
                <span className={styles.etiqueta}>Usuarios</span>
              </NavLink>
              <NavLink
                to={ROUTES.adminListados}
                title="Listados"
                onClick={onCerrar}
                className={({ isActive }) => cn(styles.navLink, isActive && styles.navLinkActive)}
              >
                <IconListados className={styles.navIcono} />
                <span className={styles.etiqueta}>Listados</span>
              </NavLink>
              <NavLink
                to={ROUTES.adminLaboratorios}
                title="Laboratorios"
                onClick={onCerrar}
                className={({ isActive }) => cn(styles.navLink, isActive && styles.navLinkActive)}
              >
                <IconFrasco className={styles.navIcono} />
                <span className={styles.etiqueta}>Laboratorios</span>
              </NavLink>
              <NavLink
                to={ROUTES.tomaMuestrasConfig}
                title="Ajustes de solicitud"
                onClick={onCerrar}
                className={({ isActive }) => cn(styles.navLink, isActive && styles.navLinkActive)}
              >
                <IconListados className={styles.navIcono} />
                <span className={styles.etiqueta}>Ajustes de solicitud</span>
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
