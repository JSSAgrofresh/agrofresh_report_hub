import type { ReactNode } from 'react'
import type { EstadoSolicitud, Totales } from '@/features/auditoriaInterna'
import { ESTADOS, ORDEN_ESTADOS } from './estados'
import styles from './AvanceInformes.module.css'

const nf = new Intl.NumberFormat('es-CL')
const nd = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 })

const CANTIDAD: Record<EstadoSolicitud, (t: Totales) => number> = {
  concretada: (t) => t.concretadas,
  sin_report: (t) => t.sinReport,
  pendiente: (t) => t.pendientes,
}

/** La cifra con la que abre el panel: qué parte de lo emitido ya se concretó.
 * Las filas de abajo son atajos: filtran la tabla por ese estado. */
export function AvanceInformes({
  totales,
  activo,
  onElegir,
}: {
  totales: Totales
  activo: EstadoSolicitud | ''
  onElegir: (e: EstadoSolicitud | '') => void
}) {
  const pct = Math.round(totales.porcentajeConcretado)
  return (
    <section className={styles.hero} aria-label="Avance de informes">
      <p className={styles.etiqueta}>Solicitudes concretadas</p>
      <div className={styles.cifraFila}>
        <span className={styles.cifra}>{pct}<small>%</small></span>
        <span className={styles.detalle}>
          <strong>{nf.format(totales.concretadas)}</strong> de {nf.format(totales.emitidas)} solicitudes emitidas
          tienen su informe guardado y en Report.
        </span>
      </div>

      <div
        className={styles.barra}
        role="img"
        aria-label={ORDEN_ESTADOS.map((e) => `${ESTADOS[e].texto}: ${CANTIDAD[e](totales)}`).join(', ')}
      >
        {ORDEN_ESTADOS.map((e) => {
          const n = CANTIDAD[e](totales)
          return n > 0 ? (
            <span key={e} className={styles.tramo} style={{ flexGrow: n, background: ESTADOS[e].color }} />
          ) : null
        })}
      </div>

      <ul className={styles.filas}>
        {ORDEN_ESTADOS.map((e) => {
          const n = CANTIDAD[e](totales)
          const seleccionado = activo === e
          return (
            <li key={e}>
              <button
                type="button"
                className={`${styles.fila} ${seleccionado ? styles.seleccionada : ''}`}
                aria-pressed={seleccionado}
                title={`${ESTADOS[e].descripcion}. Clic para filtrar la tabla.`}
                onClick={() => onElegir(seleccionado ? '' : e)}
              >
                <span className={styles.muestra} style={{ background: ESTADOS[e].color }} />
                <span className={styles.nombre}>{ESTADOS[e].texto}</span>
                <span className={styles.cantidad}>{nf.format(n)}</span>
                <span className={styles.porcentaje}>
                  {totales.emitidas ? `${nd.format((n / totales.emitidas) * 100)}%` : '—'}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export function Indicador({
  etiqueta,
  valor,
  sub,
  icono,
  alerta,
  onClick,
  activo,
}: {
  etiqueta: string
  valor: string
  sub?: string
  icono?: ReactNode
  /** resalta el valor cuando hay algo que revisar */
  alerta?: boolean
  onClick?: () => void
  activo?: boolean
}) {
  const contenido = (
    <>
      <span className={styles.indEtiqueta}>
        {icono}
        {etiqueta}
      </span>
      <span className={`${styles.indValor} ${alerta ? styles.alerta : ''}`}>{valor}</span>
      {sub && <span className={styles.indSub}>{sub}</span>}
    </>
  )
  return onClick ? (
    <button type="button" className={`${styles.indicador} ${styles.clicable} ${activo ? styles.seleccionada : ''}`} aria-pressed={activo} onClick={onClick}>
      {contenido}
    </button>
  ) : (
    <div className={styles.indicador}>{contenido}</div>
  )
}
