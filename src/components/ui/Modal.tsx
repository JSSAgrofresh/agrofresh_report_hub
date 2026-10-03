import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import { IconoCerrar } from './iconosAccion'
import styles from './Modal.module.css'

interface ModalProps {
  titulo: string
  subtitulo?: string
  onCerrar: () => void
  children: ReactNode
  /** botones del pie */
  pie?: ReactNode
  ancho?: 'normal' | 'grande'
}

/** Diálogo accesible: Esc cierra, el foco entra al diálogo y vuelve a quien lo
 * abrió, y el clic en el fondo cierra. */
export function Modal({ titulo, subtitulo, onCerrar, children, pie, ancho = 'normal' }: ModalProps) {
  const cuerpo = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null
    const objetivo = cuerpo.current?.querySelector<HTMLElement>('[data-foco], input, select, textarea') ?? cuerpo.current
    objetivo?.focus()
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar()
    }
    document.addEventListener('keydown', alTeclear)
    return () => {
      document.removeEventListener('keydown', alTeclear)
      previo?.focus?.()
    }
  }, [onCerrar])

  // Al body: dentro de un elemento con `transform` (una fila animada de una
  // tabla) un `position: fixed` queda atrapado en ese elemento y el diálogo se
  // dibuja recortado dentro de la fila.
  return createPortal(
    <div className={styles.fondo} onClick={onCerrar}>
      <div
        ref={cuerpo}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className={`${styles.modal} ${ancho === 'grande' ? styles.grande : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className={styles.cabecera}>
          <div>
            <h2>{titulo}</h2>
            {subtitulo && <p>{subtitulo}</p>}
          </div>
          <button type="button" className={styles.cerrar} onClick={onCerrar} aria-label="Cerrar">
            <IconoCerrar />
          </button>
        </header>
        <div className={styles.cuerpo}>{children}</div>
        {pie && <footer className={styles.pie}>{pie}</footer>}
      </div>
    </div>,
    document.body,
  )
}
