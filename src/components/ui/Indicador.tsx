import type { ReactNode } from 'react'
import styles from './Indicador.module.css'

/** Una cifra con su etiqueta: para resúmenes de un vistazo. Con `onClick` se
 * vuelve un botón (por ejemplo, para aplicar un filtro). */
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
      <span className={styles.etiqueta}>
        {icono}
        {etiqueta}
      </span>
      <span className={`${styles.valor} ${alerta ? styles.alerta : ''}`}>{valor}</span>
      {sub && <span className={styles.sub}>{sub}</span>}
    </>
  )
  return onClick ? (
    <button type="button" className={`${styles.indicador} ${styles.clicable} ${activo ? styles.seleccionado : ''}`} aria-pressed={activo} onClick={onClick}>
      {contenido}
    </button>
  ) : (
    <div className={styles.indicador}>{contenido}</div>
  )
}
