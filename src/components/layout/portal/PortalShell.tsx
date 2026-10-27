import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
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
import { setPaletaActiva } from '@/lib/paleta'
import { guardarTema, temaGuardado, TEMAS_PORTAL, useTemaPredeterminado } from './tema'
import type { TemaPortal } from './tema'
import styles from './PortalShell.module.css'

interface Enlace {
  to: string
  etiqueta: string
  /** Cómo se escribe en un teléfono, donde el nombre completo no cabe en la barra. */
  corta?: string
  fin?: boolean
}

/** Cómo se llaman, para un cliente, los accesos de siempre: el Report es su análisis de laboratorio y el Storage, sus informes. */
const ETIQUETA_PORTAL: Record<string, { etiqueta: string; corta: string }> = {
  reports: { etiqueta: 'Análisis de Laboratorio', corta: 'Análisis' },
  storage: { etiqueta: 'Informes de Laboratorio', corta: 'Informes' },
}

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
    if (m) lista.push({ to: id === 'reports' ? ROUTES.reportsLaboratorio : m.ruta, ...ETIQUETA_PORTAL[id] })
  }
  if (accutab) lista.push({ to: ROUTES.dashboard, etiqueta: 'Reportes Accutab', corta: 'Accutab', fin: true })
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
  { to: ROUTES.vistaClienteReport, etiqueta: 'Análisis de Laboratorio', corta: 'Análisis', modulo: 'reports' },
  { to: ROUTES.vistaClienteStorage, etiqueta: 'Informes de Laboratorio', corta: 'Informes', modulo: 'storage' },
  { to: ROUTES.vistaClienteAccutab, etiqueta: 'Reportes Accutab', corta: 'Accutab', modulo: 'trace' },
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
  // Teléfono acostado: la barra no cabe, así que queda plegada tras un botón de tres rayitas arriba a la izquierda.
  const [menuAbierto, setMenuAbierto] = useState(false)
  const items = useRef<HTMLDivElement>(null)
  const pildora = useRef<HTMLSpanElement>(null)
  const predeterminado = useTemaPredeterminado(user?.id)
  const [elegido, setElegido] = useState<TemaPortal | null>(() => (vistaPrevia ? temaGuardado() : null))
  // Los clientes ven siempre el predeterminado; quien mira la vista previa puede alternar entre los estilos.
  const tema = vistaPrevia ? (elegido ?? predeterminado) : predeterminado

  useEffect(() => {
    let ultimo = window.scrollY
    const alScroll = () => {
      setScroll(window.scrollY > 8)
      // Si la persona se mueve por la página, el menú desplegado vuelve a plegarse.
      if (Math.abs(window.scrollY - ultimo) > 24) setMenuAbierto(false)
      ultimo = window.scrollY
    }
    window.addEventListener('scroll', alScroll, { passive: true })
    return () => window.removeEventListener('scroll', alScroll)
  }, [])

  // Al cerrar o abrir el menú, los filtros pegados recalculan su lugar (miden la barra).
  useEffect(() => {
    window.dispatchEvent(new Event('resize'))
  }, [menuAbierto])


  // Los gráficos leen la paleta al dibujarse: se fija antes que sus hijos y, al cambiar de estilo, el contenido se remonta.
  setPaletaActiva(tema)
  usePildora(items, pildora, `${pathname}|${tema}`)

  if (!user) return null
  // En la vista previa, cada pestaña solo si la cuenta tiene ese módulo (el administrador general los tiene todos).
  const modulosDeLaCuenta = modulosPermitidos(user).map((m) => m.id)
  const enlaces = vistaPrevia ? ENLACES_VISTA_PREVIA.filter((e) => modulosDeLaCuenta.includes(e.modulo as never)) : enlacesDe(user)

  return (
    <PortalContext.Provider value={true}>
    <div className={styles.shell} data-portal="" data-tema={tema}>
      <div className={styles.fondo} aria-hidden="true">
        <div className={cn(styles.mancha, styles.m1)} />
        <div className={cn(styles.mancha, styles.m2)} />
        <div className={cn(styles.mancha, styles.m3)} />
      </div>

      <button
        type="button"
        className={cn(styles.hamburguesa, menuAbierto && styles.hamburguesaAbierta)}
        aria-label={menuAbierto ? 'Cerrar el menú' : 'Abrir el menú'}
        aria-expanded={menuAbierto}
        onClick={() => setMenuAbierto((v) => !v)}
      >
        <span aria-hidden="true" />
      </button>

      <nav
        className={cn(styles.burbuja, scroll && styles.burbujaScroll, menuAbierto && styles.burbujaAbierta)}
        aria-label="Secciones"
        data-plegable={menuAbierto ? 'abierto' : 'cerrado'}
      >
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
              onClick={() => setMenuAbierto(false)}
              className={({ isActive }) => cn(styles.enlace, isActive && styles.enlaceActivo)}
              aria-label={e.corta ? e.etiqueta : undefined}
              title={e.corta ? e.etiqueta : undefined}
            >
              {e.corta ? (
                <>
                  <span className={styles.largo}>{e.etiqueta}</span>
                  <span className={styles.corto} aria-hidden="true">{e.corta}</span>
                </>
              ) : (
                e.etiqueta
              )}
            </NavLink>
          ))}
        </div>
        {vistaPrevia && (
          <div className={styles.temas} role="group" aria-label="Estilo del dashboard">
            {TEMAS_PORTAL.map((t) => (
              <button
                key={t.id}
                type="button"
                className={cn(styles.tema, tema === t.id && styles.temaActivo)}
                aria-pressed={tema === t.id}
                title={t.id === predeterminado ? 'El que ven hoy los clientes' : 'Desactivado para los clientes'}
                onClick={() => {
                  setElegido(t.id)
                  guardarTema(t.id)
                }}
              >
                {t.nombre}
                {t.id === predeterminado && <span className={styles.punto} aria-label="activo para clientes" />}
              </button>
            ))}
          </div>
        )}
        <div className={styles.usuario}>
          <MenuUsuario user={user} vistaPrevia={vistaPrevia} onSalir={() => logout()} />
          <button type="button" className={styles.salir} onClick={() => logout()} title="Cerrar sesión" aria-label="Cerrar sesión">
            <IconLogout />
          </button>
        </div>
      </nav>

      <main className={styles.contenido} ref={contenido as RefObject<HTMLElement>}>
        <Fragment key={tema}>{children}</Fragment>
      </main>
    </div>
    </PortalContext.Provider>
  )
}
