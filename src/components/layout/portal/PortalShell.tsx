import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import agrofreshLogo from '@/assets/agrofresh-logo.png'
import { useAuth } from '@/features/auth'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/lib/cn'
import { iniciales, modulosPermitidos, puedeVerTomaMuestras } from '@/features/usuarios'
import { IconLogout } from '@/components/ui/icons'
import styles from './PortalShell.module.css'

interface Enlace {
  to: string
  etiqueta: string
  fin?: boolean
}

/** Los mismos accesos que hoy trae la barra lateral para una cuenta de cliente o comercial, en una burbuja arriba. */
function enlacesDe(user: NonNullable<ReturnType<typeof useAuth>['user']>): Enlace[] {
  const lista: Enlace[] = [{ to: ROUTES.dashboard, etiqueta: 'Panel general', fin: true }]
  for (const m of modulosPermitidos(user)) {
    if (m.estado === 'disponible') lista.push({ to: m.ruta, etiqueta: m.nombre })
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
export function PortalShell({ contenido, children }: { contenido?: RefObject<HTMLElement | null>; children: React.ReactNode }) {
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
  const enlaces = enlacesDe(user)

  return (
    <div className={styles.shell}>
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
          <span className={styles.iniciales} aria-hidden="true">{iniciales(user.nombre)}</span>
          <span className={styles.nombre}>{user.nombre}</span>
          <button type="button" className={styles.salir} onClick={() => logout()} title="Cerrar sesión" aria-label="Cerrar sesión">
            <IconLogout />
          </button>
        </div>
      </nav>

      <main className={styles.contenido} ref={contenido as RefObject<HTMLElement>}>
        {children}
      </main>
    </div>
  )
}
