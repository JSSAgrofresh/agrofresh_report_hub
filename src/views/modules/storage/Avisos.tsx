import type { Aviso } from '@/features/storage'
import { cn } from '@/lib/cn'
import styles from './Avisos.module.css'

/** Los avisos flotantes de Storage: aparecen abajo a la derecha y se van solos. */
export function Avisos({ avisos, onQuitar }: { avisos: Aviso[]; onQuitar: (id: number) => void }) {
  if (avisos.length === 0) return null
  return (
    <div className={styles.pila} role="status" aria-live="polite">
      {avisos.map((a) => (
        <div key={a.id} className={cn(styles.aviso, a.tipo === 'error' ? styles.error : styles.ok)}>
          <span className={styles.marca} aria-hidden>
            {a.tipo === 'error' ? '!' : '✓'}
          </span>
          <span className={styles.texto}>{a.texto}</span>
          <button type="button" className={styles.cerrar} onClick={() => onQuitar(a.id)} aria-label="Cerrar aviso">
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
