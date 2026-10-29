import type { CSSProperties } from 'react'
import type { ClaveBloque } from '@/features/reportes/lib/bloquesAnalisis'
import { IconBacteria, IconManzanaGusano, IconMatraz } from './IconosAnalisis'
import styles from './TarjetasAnalisis.module.css'

const TARJETAS: { bloque: ClaveBloque; nombre: string; icono: typeof IconMatraz }[] = [
  { bloque: 'residuales', nombre: 'Residuos', icono: IconMatraz },
  { bloque: 'fsma', nombre: 'FSMA', icono: IconBacteria },
  { bloque: 'fito', nombre: 'Fitopatología', icono: IconManzanaGusano },
]

/**
 * Tres tarjetas, una por tipo de análisis, arriba del Report: cada una dice cuántos informes hay hoy (con los filtros
 * puestos) y, al tocarla, lleva directo a ese análisis. La navegación libre sigue igual: es solo un atajo.
 */
export function TarjetasAnalisis({
  totales,
  acento,
  onElegir,
}: {
  totales: Record<ClaveBloque, number>
  acento: string
  onElegir: (bloque: ClaveBloque) => void
}) {
  return (
    <nav className={styles.fila} aria-label="Ir a un análisis" style={{ '--acento': acento } as CSSProperties}>
      {TARJETAS.map(({ bloque, nombre, icono: Icono }) => (
        <button key={bloque} type="button" className={styles.tarjeta} onClick={() => onElegir(bloque)} aria-label={`${nombre}: ${totales[bloque]} informes. Ir al análisis`}>
          <span className={styles.datos}>
            <span className={styles.nombre}>{nombre}</span>
            <span className={styles.total}>
              <b>{totales[bloque].toLocaleString('es-CL')}</b>
              <small>{totales[bloque] === 1 ? 'informe' : 'informes'}</small>
            </span>
          </span>
          <span className={styles.icono}>
            <Icono />
          </span>
        </button>
      ))}
    </nav>
  )
}

export interface TarjetaSuelta {
  nombre: string
  total: number
  unidad: { uno: string; varios: string }
  icono: typeof IconMatraz
  onElegir: () => void
}

/** Las mismas tarjetas, pero de las secciones del reporte de Accu-Tab (Accutab, Costo por kilo…): cada una con su total e ícono. */
export function TarjetasSueltas({ tarjetas, acento }: { tarjetas: TarjetaSuelta[]; acento: string }) {
  return (
    <nav
      className={`${styles.fila} ${tarjetas.length === 1 ? styles.filaUna : ''}`}
      aria-label={tarjetas.length === 1 ? `Ir a ${tarjetas[0].nombre}` : 'Ir a una sección'}
      style={{ '--acento': acento } as CSSProperties}
    >
      {tarjetas.map(({ nombre, total, unidad, icono: Icono, onElegir }) => (
        <button key={nombre} type="button" className={styles.tarjeta} onClick={onElegir} aria-label={`${nombre}: ${total} ${unidad.varios}. Ir al reporte`}>
          <span className={styles.datos}>
            <span className={styles.nombre}>{nombre}</span>
            <span className={styles.total}>
              <b>{total.toLocaleString('es-CL')}</b>
              <small>{total === 1 ? unidad.uno : unidad.varios}</small>
            </span>
          </span>
          <span className={styles.icono}>
            <Icono />
          </span>
        </button>
      ))}
    </nav>
  )
}

/** La misma tarjeta, sola: Accu-Tab tiene un único «análisis», con su total y un ícono propio. */
export function TarjetaUnica({ acento, ...tarjeta }: TarjetaSuelta & { acento: string }) {
  return <TarjetasSueltas tarjetas={[tarjeta]} acento={acento} />
}
