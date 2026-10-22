import { useId, type ReactNode } from 'react'
import styles from './InfoTip.module.css'

/**
 * Ícono «i» que muestra una explicación al pasar el mouse (o al enfocarlo con el teclado / tocarlo en el celular).
 * Reemplaza a los textos explicativos sueltos para dejar la pantalla limpia.
 */
export function InfoTip({ children, etiqueta = 'Más información' }: { children: ReactNode; etiqueta?: string }) {
  const id = useId()
  return (
    <span className={styles.raiz}>
      <button type="button" className={styles.icono} aria-label={etiqueta} aria-describedby={id}>
        i
      </button>
      <span role="tooltip" id={id} className={styles.globo}>
        {children}
      </span>
    </span>
  )
}
