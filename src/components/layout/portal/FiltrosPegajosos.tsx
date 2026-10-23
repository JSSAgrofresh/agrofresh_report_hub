import { useContext, useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useMediaQuery } from '@/hooks/useAnchoMaximo'
import { PortalContext } from './PortalContext'
import styles from './FiltrosPegajosos.module.css'

interface Geometria {
  top: number
  left: number
  width: number
}

/**
 * La tarjeta de filtros del Report. Para el personal interno es la `<section>` de siempre. Dentro del portal de
 * clientes, cuando la burbuja de arriba la alcanza al bajar, se junta con ella (misma anchura, pegada debajo) y
 * queda como una barra delgada que acompaña el resto de la página; al volver a subir se separa y recupera su lugar.
 * Mientras está pegada, «Mostrar filtros» despliega los mismos controles.
 */
export function FiltrosPegajosos({ className, children }: { className: string; children: ReactNode }) {
  const portal = useContext(PortalContext)
  // Teléfono acostado: no hay barra a la que pegarse. Los filtros quedan en su lugar y un botón flotante los abre en una hoja con scroll.
  const compacto = useMediaQuery('(max-height: 540px) and (orientation: landscape)')
  const [hoja, setHoja] = useState(false)
  const hueco = useRef<HTMLDivElement>(null)
  const seccion = useRef<HTMLElement>(null)
  const pegadoRef = useRef(false)
  const [pegado, setPegado] = useState(false)
  const [abierto, setAbierto] = useState(false)
  const altoLibre = useRef(0)
  // Altura del hueco que deja la tarjeta al salirse de su lugar: al pegarse se encoge a 0 (lo de abajo sube con suavidad) y al despegarse vuelve a crecer.
  const [hueco_h, setHuecoH] = useState<number | null>(null)
  const [animando, setAnimando] = useState(false)
  const [geo, setGeo] = useState<Geometria | null>(null)

  useEffect(() => {
    if (!portal || compacto) return
    let cuadro = 0
    const medir = () => {
      cuadro = 0
      const nav = document.querySelector('nav[aria-label="Secciones"]')
      const h = hueco.current
      const s = seccion.current
      if (!nav || !h || !s) return
      const r = nav.getBoundingClientRect()
      const arriba = h.getBoundingClientRect().top
      if (!pegadoRef.current && arriba <= r.bottom + 2) {
        pegadoRef.current = true
        const h = s.offsetHeight
        altoLibre.current = h
        setHuecoH(h)
        setAnimando(true)
        setPegado(true)
        requestAnimationFrame(() => requestAnimationFrame(() => setHuecoH(0)))
        window.setTimeout(() => setAnimando(false), 400)
      } else if (pegadoRef.current && arriba > r.bottom + 2) {
        pegadoRef.current = false
        setPegado(false)
        setAbierto(false)
        setAnimando(true)
        setHuecoH(altoLibre.current)
        window.setTimeout(() => {
          setHuecoH(null)
          setAnimando(false)
        }, 400)
      }
      if (pegadoRef.current) {
        setGeo((g) => (g && g.top === r.bottom && g.left === r.left && g.width === r.width ? g : { top: r.bottom, left: r.left, width: r.width }))
      }
    }
    const pedir = () => {
      if (!cuadro) cuadro = requestAnimationFrame(medir)
    }
    window.addEventListener('scroll', pedir, { passive: true })
    window.addEventListener('resize', pedir)
    pedir()
    return () => {
      window.removeEventListener('scroll', pedir)
      window.removeEventListener('resize', pedir)
      if (cuadro) cancelAnimationFrame(cuadro)
    }
  }, [portal, compacto])

  // Al salir del modo compacto (o cambiar de pantalla) la hoja se cierra sola.
  useEffect(() => {
    if (!compacto) setHoja(false)
  }, [compacto])

  if (portal && compacto) {
    return (
      <div className={styles.marcador} style={hoja ? { height: seccion.current?.offsetHeight } : undefined}>
        <section
          ref={seccion}
          className={`${className} ${hoja ? styles.hoja : ''}`}
          aria-label="Filtros"
          data-hoja={hoja ? 'true' : 'false'}
        >
          {children}
        </section>
        {hoja && <div className={styles.fondoHoja} onClick={() => setHoja(false)} aria-hidden="true" />}
        <button type="button" className={styles.botonHoja} aria-expanded={hoja} onClick={() => setHoja((v) => !v)}>
          {hoja ? 'Cerrar filtros ✕' : 'Filtros ▾'}
        </button>
      </div>
    )
  }

  if (!portal) {
    return (
      <section className={className} aria-label="Filtros">
        {children}
      </section>
    )
  }

  const estilo: CSSProperties | undefined = pegado && geo ? { top: geo.top, left: geo.left, width: geo.width } : undefined
  return (
    <div
      ref={hueco}
      className={`${styles.marcador} ${animando ? styles.animando : ''}`}
      style={hueco_h != null ? { height: hueco_h } : undefined}
    >
      <section
        ref={seccion}
        className={className}
        aria-label="Filtros"
        data-pegado={pegado ? 'true' : 'false'}
        data-abierto={abierto ? 'true' : 'false'}
        style={estilo}
      >
        {children}
        {pegado && (
          <button type="button" className={styles.alternar} aria-expanded={abierto} onClick={() => setAbierto((v) => !v)}>
            {abierto ? 'Ocultar filtros ▴' : 'Mostrar filtros ▾'}
          </button>
        )}
      </section>
    </div>
  )
}
