import type { ReactNode } from 'react'
import styles from './FichaEscaneada.module.css'

interface FichaEscaneadaProps {
  titulo: string
  /** Verde: este lado ya está listo. Con los dos en verde, se puede cruzar. */
  listo?: boolean
  estado?: string
  datos: [string, string][]
  chips?: string[]
  onQuitar?: () => void
  children?: ReactNode
}

/**
 * Lo que se acaba de escanear, para confirmar de un vistazo —con la hoja o el
 * vial en la mano— que es lo correcto antes de cruzar.
 *
 * Se pone verde cuando ese lado está resuelto. Es la señal de "listo para
 * cruzar" sin tener que leer ningún texto.
 */
export function FichaEscaneada({
  titulo,
  listo = false,
  estado,
  datos,
  chips,
  onQuitar,
  children,
}: FichaEscaneadaProps) {
  return (
    <div className={[styles.ficha, listo && styles.listo].filter(Boolean).join(' ')}>
      <div className={styles.cabecera}>
        <strong className={styles.titulo}>{titulo}</strong>
        {estado && <span className={styles.estado}>{estado}</span>}
        {onQuitar && (
          <button type="button" className={styles.quitar} onClick={onQuitar}>
            Quitar
          </button>
        )}
      </div>

      {datos.length > 0 && (
        <dl className={styles.datos}>
          {datos.map(([etiqueta, valor]) => (
            <div key={etiqueta}>
              <dt>{etiqueta}</dt>
              <dd>{valor}</dd>
            </div>
          ))}
        </dl>
      )}

      {chips && chips.length > 0 && (
        <div className={styles.chips}>
          {chips.map((c) => (
            <span key={c} className={styles.chip}>
              {c}
            </span>
          ))}
        </div>
      )}

      {children}
    </div>
  )
}
