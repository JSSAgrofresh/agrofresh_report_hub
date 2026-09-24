import { useEffect, useRef, useState } from 'react'
import type { ComponentType, CSSProperties, SVGProps } from 'react'
import React from 'react'
import { NavLink } from 'react-router-dom'
import agrofreshLogo from '@/assets/agrofresh-logo.png'
import { useAuth } from '@/features/auth'
import { AREAS } from '@/constants/areas'
import { GRUPO_DATACORE } from '@/constants/modules'
import type { ModuloInfo } from '@/constants/modules'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/lib/cn'
import {
  etiquetaAcceso,
  modulosPermitidos,
  puedeAdministrarUsuarios,
  puedeCrearReanalisis,
  puedeVerTomaMuestras,
} from '@/features/usuarios'
import {
  IconConverter,
  IconDataCore,
  IconDatabase,
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
  IconUsers,
} from '@/components/ui/icons'
import { BandejaNotificaciones, ToastNotificacion, useNotificaciones } from '@/features/notificaciones'
import styles from './Sidebar.module.css'

/** Plegada, la barra deja solo los iconos. La elección se recuerda: quien
 *  trabaja todo el día en el laboratorio no quiere volver a plegarla en cada
 *  carga. Es una preferencia de esta pantalla, no un dato del sistema, así
 *  que vive en el navegador. */
const CLAVE_COLAPSO = 'agrofresh.sidebar.colapsada.v1'
const CLAVE_AVATAR = 'agrofresh.avatar.v1'

type AvatarId = 'manzana' | 'pera' | 'kiwi' | 'naranja' | 'cereza' | 'ciruela'

const AVATARES: { id: AvatarId; label: string; bg: string; svg: React.ReactNode }[] = [
  {
    id: 'manzana', label: 'Manzana', bg: '#C83C32',
    svg: (
      <svg viewBox="0 0 52 52" fill="none">
        <line x1="26" y1="14" x2="26" y2="8" stroke="rgba(255,255,255,.85)" strokeWidth="2.2" strokeLinecap="round"/>
        <path d="M26 10 C27 8 31 7 32 9" stroke="rgba(255,255,255,.85)" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
        <path d="M26 14 C26 14 22 12 17 14 C12 16 9 21 9 26 C9 34 15 43 26 43 C37 43 43 34 43 26 C43 21 40 16 35 14 C30 12 26 14 26 14 Z" fill="rgba(255,255,255,.95)"/>
        <path d="M26 14 C26 16 24 17 26 18 C28 17 26 16 26 14" fill="#C83C32"/>
      </svg>
    ),
  },
  {
    id: 'pera', label: 'Pera', bg: '#78A628',
    svg: (
      <svg viewBox="0 0 52 52" fill="none">
        <line x1="26" y1="12" x2="26" y2="7" stroke="rgba(255,255,255,.85)" strokeWidth="2.2" strokeLinecap="round"/>
        <path d="M26 12 C24 12 22 10 20 13 C18 17 19 22 19 22 C13 24 10 28 10 32 C10 38 17 43 26 43 C35 43 42 38 42 32 C42 28 39 24 33 22 C33 22 34 17 32 13 C30 10 28 12 26 12 Z" fill="rgba(255,255,255,.95)"/>
      </svg>
    ),
  },
  {
    id: 'kiwi', label: 'Kiwi', bg: '#48782A',
    svg: (
      <svg viewBox="0 0 52 52" fill="none">
        <defs><clipPath id="av-kc"><ellipse cx="26" cy="26" rx="17" ry="16"/></clipPath></defs>
        <ellipse cx="26" cy="26" rx="17" ry="16" fill="rgba(255,255,255,.95)"/>
        <g clipPath="url(#av-kc)">
          <ellipse cx="26" cy="26" rx="4.5" ry="4" fill="#48782A"/>
          <line x1="26" y1="10" x2="26" y2="22" stroke="#48782A" strokeWidth="1.3" strokeLinecap="round"/>
          <line x1="26" y1="30" x2="26" y2="42" stroke="#48782A" strokeWidth="1.3" strokeLinecap="round"/>
          <line x1="9"  y1="26" x2="21" y2="26" stroke="#48782A" strokeWidth="1.3" strokeLinecap="round"/>
          <line x1="31" y1="26" x2="43" y2="26" stroke="#48782A" strokeWidth="1.3" strokeLinecap="round"/>
          <line x1="14" y1="14" x2="22" y2="22" stroke="#48782A" strokeWidth="1.3" strokeLinecap="round"/>
          <line x1="30" y1="30" x2="38" y2="38" stroke="#48782A" strokeWidth="1.3" strokeLinecap="round"/>
          <line x1="38" y1="14" x2="30" y2="22" stroke="#48782A" strokeWidth="1.3" strokeLinecap="round"/>
          <line x1="14" y1="38" x2="22" y2="30" stroke="#48782A" strokeWidth="1.3" strokeLinecap="round"/>
        </g>
      </svg>
    ),
  },
  {
    id: 'naranja', label: 'Naranja', bg: '#DC7418',
    svg: (
      <svg viewBox="0 0 52 52" fill="none">
        <defs><clipPath id="av-nc"><circle cx="26" cy="28" r="17"/></clipPath></defs>
        <line x1="26" y1="11" x2="26" y2="13" stroke="rgba(255,255,255,.85)" strokeWidth="2" strokeLinecap="round"/>
        <path d="M26 12 C27 10 31 9 32 11" stroke="rgba(255,255,255,.85)" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
        <circle cx="26" cy="28" r="17" fill="rgba(255,255,255,.95)"/>
        <g clipPath="url(#av-nc)">
          <line x1="26" y1="11" x2="26" y2="45" stroke="#DC7418" strokeWidth="1.1"/>
          <line x1="9"  y1="28" x2="43" y2="28" stroke="#DC7418" strokeWidth="1.1"/>
          <line x1="14" y1="16" x2="38" y2="40" stroke="#DC7418" strokeWidth="1.1"/>
          <line x1="38" y1="16" x2="14" y2="40" stroke="#DC7418" strokeWidth="1.1"/>
          <circle cx="26" cy="28" r="3" fill="#DC7418"/>
        </g>
      </svg>
    ),
  },
  {
    id: 'cereza', label: 'Cereza', bg: '#AC1E3C',
    svg: (
      <svg viewBox="0 0 52 52" fill="none">
        <path d="M19 29 C19 24 20 17 26 14 C32 11 33 7 33 7" stroke="rgba(255,255,255,.85)" strokeWidth="2.2" strokeLinecap="round" fill="none"/>
        <path d="M33 29 C33 25 33 20 26 14" stroke="rgba(255,255,255,.85)" strokeWidth="2.2" strokeLinecap="round" fill="none"/>
        <circle cx="19" cy="35" r="9" fill="rgba(255,255,255,.95)"/>
        <circle cx="33" cy="35" r="9" fill="rgba(255,255,255,.95)"/>
      </svg>
    ),
  },
  {
    id: 'ciruela', label: 'Ciruela', bg: '#6A2D94',
    svg: (
      <svg viewBox="0 0 52 52" fill="none">
        <defs><clipPath id="av-cc"><circle cx="26" cy="29" r="15"/></clipPath></defs>
        <line x1="26" y1="14" x2="26" y2="9" stroke="rgba(255,255,255,.85)" strokeWidth="2.2" strokeLinecap="round"/>
        <path d="M26 11 C27 9 31 8 32 10" stroke="rgba(255,255,255,.85)" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
        <circle cx="26" cy="29" r="15" fill="rgba(255,255,255,.95)"/>
        <path d="M26 14 C24 22 24 34 26 44" stroke="#6A2D94" strokeWidth="1.8" strokeLinecap="round" clipPath="url(#av-cc)"/>
      </svg>
    ),
  },
]

function leerAvatar(): AvatarId {
  try { return (localStorage.getItem(CLAVE_AVATAR) as AvatarId) || 'manzana' } catch { return 'manzana' }
}
function guardarAvatar(id: AvatarId) {
  try { localStorage.setItem(CLAVE_AVATAR, id) } catch { /* noop */ }
}

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
  ingesta: IconIngest,
  datacore: IconDataCore,
  trace: IconTrace,
  converter: IconConverter,
  ingest: IconIngest,
  reports: IconReports,
  agrofresh_lab: IconFrasco,
  storage: IconStorage,
}

function renderEnlaceModulo(m: ModuloInfo, onCerrar: () => void) {
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
}

interface SidebarProps {
  abierto: boolean
  onCerrar: () => void
}

export function Sidebar({ abierto, onCerrar }: SidebarProps) {
  const { user, logout } = useAuth()
  const [colapsada, setColapsada] = useState(leerColapso)
  const [avatarId, setAvatarId] = useState<AvatarId>(leerAvatar)
  const [selectorAbierto, setSelectorAbierto] = useState(false)
  const [bandejaAbierta, setBandejaAbierta] = useState(false)
  const avatarZonaRef = useRef<HTMLDivElement>(null)
  const { habilitado: notifHabilitadas, noLeidas, marcarTodasLeidas, toast, limpiarToast } = useNotificaciones()

  // Cierra el selector al hacer clic fuera del área avatar + popover.
  useEffect(() => {
    if (!selectorAbierto) return
    function onClickFuera(e: MouseEvent) {
      if (avatarZonaRef.current && !avatarZonaRef.current.contains(e.target as Node)) {
        setSelectorAbierto(false)
      }
    }
    document.addEventListener('mousedown', onClickFuera)
    return () => document.removeEventListener('mousedown', onClickFuera)
  }, [selectorAbierto])

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
  const modulosDataCore = modulos.filter((m) => m.grupo === GRUPO_DATACORE)
  const otrosModulos = modulos.filter((m) => m.grupo !== GRUPO_DATACORE)
  const esAdmin = puedeAdministrarUsuarios(user)
  const veTomaMuestras = puedeVerTomaMuestras(user)
  const puedeReanalisis = puedeCrearReanalisis(user)
  const acento = user.area ? AREAS[user.area].colorPrimario : undefined
  const estiloSidebar = acento ? ({ '--acento-usuario': acento } as CSSProperties) : undefined

  const avatarActual = AVATARES.find((a) => a.id === avatarId)

  return (
    <>
      {abierto && <div className={styles.overlay} onClick={onCerrar} />}
      <aside
        className={cn(styles.sidebar, abierto && styles.abierto, colapsada && styles.colapsada)}
        style={estiloSidebar}
      >
        <div className={styles.brand}>
          <svg className={styles.iconoGrafico} viewBox="0 0 28 20" fill="none" aria-hidden="true">
            <rect x="0"  y="10" width="5" height="10" rx="1.5" fill="#5a9430"/>
            <rect x="7"  y="5"  width="5" height="15" rx="1.5" fill="#6dad3c"/>
            <rect x="14" y="1"  width="5" height="19" rx="1.5" fill="#8dc85a"/>
            <rect x="21" y="7"  width="5" height="13" rx="1.5" fill="#e8c32e"/>
          </svg>
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

          {notifHabilitadas && (
            <button
              type="button"
              className={cn(styles.navLink, noLeidas > 0 && styles.navLinkNotifPendiente)}
              onClick={() => {
                setBandejaAbierta(true)
                onCerrar()
                if (noLeidas > 0) marcarTodasLeidas()
              }}
              title="Notificaciones"
            >
              <svg className={styles.navIcono} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10 2a6 6 0 0 1 6 6c0 3.5 1.5 5 1.5 5h-15S4 11.5 4 8a6 6 0 0 1 6-6z"/>
                <path d="M8.5 17a1.5 1.5 0 0 0 3 0"/>
              </svg>
              <span className={styles.etiqueta}>Notificaciones</span>
              {noLeidas > 0 && (
                <span className={styles.estadoPill}>{noLeidas > 9 ? '9+' : noLeidas}</span>
              )}
            </button>
          )}

          {bandejaAbierta && (
            <BandejaNotificaciones onCerrar={() => setBandejaAbierta(false)} />
          )}

          {toast && <ToastNotificacion notif={toast} onCerrar={limpiarToast} />}

          {modulosDataCore.length > 0 && (
            <>
              <p className={styles.seccion}>Data Core</p>
              {modulosDataCore.map((m) => renderEnlaceModulo(m, onCerrar))}
            </>
          )}

          {otrosModulos.length > 0 && (
            <>
              <p className={styles.seccion}>Funciones</p>
              {otrosModulos.map((m) => renderEnlaceModulo(m, onCerrar))}
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
              {puedeReanalisis && (
                <NavLink
                  to={ROUTES.tomaMuestrasNuevaReanalisis}
                  title="Nueva solicitud de reanálisis"
                  onClick={onCerrar}
                  className={({ isActive }) => cn(styles.navLink, isActive && styles.navLinkActive)}
                >
                  <IconEmitir className={styles.navIcono} />
                  <span className={styles.etiqueta}>Solicitud reanálisis</span>
                </NavLink>
              )}
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
                to={ROUTES.adminNotificaciones}
                title="Notificaciones"
                onClick={onCerrar}
                className={({ isActive }) => cn(styles.navLink, isActive && styles.navLinkActive)}
              >
                <svg className={styles.navIcono} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M10 2a6 6 0 0 1 6 6c0 3.5 1.5 5 1.5 5h-15S4 11.5 4 8a6 6 0 0 1 6-6z"/>
                  <path d="M8.5 17a1.5 1.5 0 0 0 3 0"/>
                </svg>
                <span className={styles.etiqueta}>Notificaciones</span>
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
            <span>Base de datos: pendiente</span>
          </div>

          <div className={styles.usuario}>
            {/* Zona avatar + popover: un div wrapper para el clic-fuera */}
            <div ref={avatarZonaRef} style={{ position: 'relative', flexShrink: 0 }}>
              <button
                type="button"
                className={styles.usuarioAvatarBtn}
                onClick={() => setSelectorAbierto((v) => !v)}
                aria-label="Cambiar avatar"
                title="Cambiar avatar"
              >
                <div
                  className={styles.usuarioAvatar}
                  style={{ background: avatarActual?.bg ?? '#C83C32' }}
                >
                  <div style={{ width: 34, height: 34 }}>
                    {avatarActual?.svg}
                  </div>
                </div>
              </button>

              {selectorAbierto && (
                <div className={styles.avatarPopover}>
                  {AVATARES.map((av) => (
                    <button
                      key={av.id}
                      type="button"
                      className={cn(styles.avatarOpcion, avatarId === av.id && styles.avatarOpcionActiva)}
                      title={av.label}
                      onClick={() => {
                        setAvatarId(av.id)
                        guardarAvatar(av.id)
                        setSelectorAbierto(false)
                      }}
                    >
                      <div style={{ background: av.bg, width: 44, height: 44, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ width: 34, height: 34 }}>{av.svg}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
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
