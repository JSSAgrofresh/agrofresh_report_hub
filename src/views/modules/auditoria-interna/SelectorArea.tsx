import type { AreaPivote } from '@/features/auditoriaInterna'
import { NOMBRE_RYD } from '@/features/auditoriaInterna'
import styles from './SelectorArea.module.css'

/**
 * El título-selector del panel: «OPERACIONES» largo (Línea de proceso y
 * Actimist) y «R&D» más chico a la derecha, como continuación. Sin nada elegido
 * se ve todo; tocar un área filtra donas y tabla, y tocarla de nuevo vuelve a
 * ver todo.
 */
export function SelectorArea({ area, onChange }: { area: AreaPivote | null; onChange: (a: AreaPivote | null) => void }) {
  const alternar = (a: AreaPivote) => onChange(area === a ? null : a)
  return (
    <div className={styles.barra} role="group" aria-label="Área">
      <button
        type="button"
        aria-pressed={area === 'operaciones'}
        className={`${styles.area} ${styles.operaciones} ${area === 'operaciones' ? styles.activa : ''} ${area === 'rd' ? styles.apagada : ''}`}
        onClick={() => alternar('operaciones')}
      >
        <span className={styles.nombre}>Operaciones</span>
        <small>Línea de proceso · Actimist</small>
      </button>
      <button
        type="button"
        aria-pressed={area === 'rd'}
        title={NOMBRE_RYD}
        className={`${styles.area} ${styles.rd} ${area === 'rd' ? styles.activa : ''} ${area === 'operaciones' ? styles.apagada : ''}`}
        onClick={() => alternar('rd')}
      >
        <span className={styles.nombre}>R&amp;D</span>
        <small>Investigación y Desarrollo</small>
      </button>
    </div>
  )
}
