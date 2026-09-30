import { useEffect } from 'react'
import type { ReactNode } from 'react'
import styles from './Dialogo.module.css'

interface DialogoProps {
  titulo: string
  /** «amplio» para vistas previas. */
  ancho?: 'normal' | 'amplio'
  onCerrar: () => void
  children: ReactNode
  /** Botones de abajo. */
  pie?: ReactNode
}

/** Ventana centrada para las preguntas de Storage (nombre, confirmar, elegir
 * destino). Se cierra con Escape o haciendo clic afuera. */
export function Dialogo({ titulo, ancho = 'normal', onCerrar, children, pie }: DialogoProps) {
  useEffect(() => {
    function alTeclear(e: KeyboardEvent) {
      if (e.key === 'Escape') onCerrar()
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [onCerrar])

  return (
    <div className={styles.fondo} onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className={`${styles.ventana} ${ancho === 'amplio' ? styles.amplia : ''}`} role="dialog" aria-modal="true" aria-label={titulo}>
        <h2 className={styles.titulo}>{titulo}</h2>
        <div className={styles.cuerpo}>{children}</div>
        {pie && <div className={styles.pie}>{pie}</div>}
      </div>
    </div>
  )
}
