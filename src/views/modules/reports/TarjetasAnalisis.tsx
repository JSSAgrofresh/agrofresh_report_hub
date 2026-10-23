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
