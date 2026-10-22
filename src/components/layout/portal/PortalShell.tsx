import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import agrofreshLogo from '@/assets/agrofresh-logo.png'
import { useAuth } from '@/features/auth'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/lib/cn'
import { modulosPermitidos, puedeVerTomaMuestras, vistaDeCliente } from '@/features/usuarios'
import { ocultaPanelGeneral } from './inicio'
import { PortalContext } from './PortalContext'
import { MenuUsuario } from './MenuUsuario'
import { IconLogout } from '@/components/ui/icons'
import styles from './PortalShell.module.css'

interface Enlace {
  to: string
  etiqueta: string
  fin?: boolean
}

/** Cómo se llaman, para un cliente, los accesos de siempre: el Report es su análisis de laboratorio y el Storage, sus informes. */
const ETIQUETA_PORTAL: Record<string, string> = { reports: 'Análisis de Laboratorio', storage: 'Informes de Laboratorio' }

/** Los mismos accesos que hoy trae la barra lateral para una cuenta de cliente o comercial, en una burbuja arriba.
 * Primero Análisis de Laboratorio (Report), Informes de Laboratorio (Storage) y Reportes Accutab; después lo demás. */
function enlacesDe(user: NonNullable<ReturnType<typeof useAuth>['user']>): Enlace[] {
  const accutab = vistaDeCliente(user).accutab
  const disponibles = modulosPermitidos(user).filter((m) => m.estado === 'disponible')
  const lista: Enlace[] = []
  // Sin nada más adónde aterrizar, queda el Panel general; con informes Accu-Tab, su acceso lo reemplaza.
  if (!ocultaPanelGeneral(user) && !accutab) lista.push({ to: ROUTES.dashboard, etiqueta: 'Panel general', fin: true })
  for (const id of ['reports', 'storage']) {
    const m = disponibles.find((x) => x.id === id)
    // El Report de un cliente abre directo en sus gráficos (su único reporte), sin pasar por el menú de reportes.
    if (m) lista.push({ to: id === 'reports' ? ROUTES.reportsLaboratorio : m.ruta, etiqueta: ETIQUETA_PORTAL[id] })
  }
  if (accutab) lista.push({ to: ROUTES.dashboard, etiqueta: 'Reportes Accutab', fin: true })
  for (const m of disponibles) {
    if (m.id !== 'reports' && m.id !== 'storage') lista.push({ to: m.ruta, etiqueta: m.nombre })
  }
  if (puedeVerTomaMuestras(user)) {
    lista.push({ to: ROUTES.tomaMuestras, etiqueta: 'Solicitudes e informes', fin: true })
  }
  return lista
}

/** Mueve la píldora verde bajo el enlace activo. */
function usePildora(contenedor: RefObject<HTMLDivElement | null>, pildora: RefObject<HTMLSpanElement | null>, clave: string) {
  useLayoutEffect(() => {
    const c = contenedor.current
    const p = pildora.current
    if (!c || !p) return
    const colocar = () => {
      const activo = c.querySelector<HTMLElement>('a[aria-current="page"]')
      p.style.setProperty('width', activo ? `${activo.offsetWidth}px` : '0px')
      if (!activo) return
      p.style.setProperty('left', `${activo.offsetLeft}px`)
      c.scrollTo?.({ left: activo.offsetLeft - c.clientWidth / 2 + activo.offsetWidth / 2, behavior: 'smooth' })
    }
    colocar()
    window.addEventListener('resize', colocar)
    void document.fonts?.ready.then(colocar)
    return () => window.removeEventListener('resize', colocar)
  }, [contenedor, pildora, clave])
}

/** Marco visual del portal de clientes y comerciales: fondo vivo, navbar de vidrio fija arriba y el contenido de siempre. */
const ENLACES_VISTA_PREVIA: (Enlace & { modulo: string })[] = [
  { to: ROUTES.vistaClienteReport, etiqueta: 'Análisis de Laboratorio', modulo: 'reports' },
  { to: ROUTES.vistaClienteStorage, etiqueta: 'Informes de Laboratorio', modulo: 'storage' },
]

export function PortalShell({
  contenido,
  vistaPrevia,
  children,
}: {
  contenido?: RefObject<HTMLElement | null>
  /** El administrador general mirando el portal de clientes con su propia cuenta. */
  vistaPrevia?: boolean
  children: React.ReactNode
}) {
  const { user, logout } = useAuth()
  const { pathname } = useLocation()
  const [scroll, setScroll] = useState(false)
  const items = useRef<HTMLDivElement>(null)
  const pildora = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const alScroll = () => setScroll(window.scrollY > 8)
    window.addEventListener('scroll', alScroll, { passive: true })
    return () => window.removeEventListener('scroll', alScroll)
  }, [])

  usePildora(items, pildora, pathname)

  if (!user) return null
  // En la vista previa, cada pestaña solo si la cuenta tiene ese módulo (el administrador general los tiene todos).
  const modulosDeLaCuenta = modulosPermitidos(user).map((m) => m.id)
  const enlaces = vistaPrevia ? ENLACES_VISTA_PREVIA.filter((e) => modulosDeLaCuenta.includes(e.modulo as never)) : enlacesDe(user)

  return (
    <PortalContext.Provider value={true}>
    <div className={styles.shell} data-portal="">
      <div className={styles.fondo} aria-hidden="true">
        <div className={cn(styles.mancha, styles.m1)} />
        <div className={cn(styles.mancha, styles.m2)} />
        <div className={cn(styles.mancha, styles.m3)} />
      </div>

      <nav className={cn(styles.burbuja, scroll && styles.burbujaScroll)} aria-label="Secciones">
        <NavLink to={ROUTES.dashboard} className={styles.marca} aria-label="AgroFresh, ir al panel general">
          <img src={agrofreshLogo} alt="AgroFresh" className={styles.logo} />
        </NavLink>
        <div className={styles.items} ref={items}>
          <span className={styles.pildora} ref={pildora} aria-hidden="true" />
          {enlaces.map((e) => (
            <NavLink
              key={e.to}
              to={e.to}
              end={e.fin}
              className={({ isActive }) => cn(styles.enlace, isActive && styles.enlaceActivo)}
            >
              {e.etiqueta}
            </NavLink>
          ))}
        </div>
        <div className={styles.usuario}>
          <MenuUsuario user={user} vistaPrevia={vistaPrevia} onSalir={() => logout()} />
          <button type="button" className={styles.salir} onClick={() => logout()} title="Cerrar sesión" aria-label="Cerrar sesión">
            <IconLogout />
          </button>
        </div>
      </nav>

      <main className={styles.contenido} ref={contenido as RefObject<HTMLElement>}>
        {children}
      </main>
    </div>
    </PortalContext.Provider>
  )
}
