import { useId, useRef, type ReactNode } from 'react'
import styles from './InfoTip.module.css'

/**
 * Ícono «i» que muestra una explicación al pasar el mouse (o al enfocarlo con el teclado / tocarlo en el celular).
 * Reemplaza a los textos explicativos sueltos para dejar la pantalla limpia. El globo solo existe mientras se ve, y se
 * corre lo necesario para no salirse de la pantalla (en el celular, un globo escondido fuera del borde ensanchaba la página).
 */
export function InfoTip({ children, etiqueta = 'Más información' }: { children: ReactNode; etiqueta?: string }) {
  const id = useId()
  const globo = useRef<HTMLSpanElement>(null)

  function acomodar() {
    requestAnimationFrame(() => {
      const g = globo.current
      if (!g) return
      g.style.marginLeft = '0px'
      const r = g.getBoundingClientRect()
      const ancho = document.documentElement.clientWidth
      const margen = 12
      let corrida = 0
      if (r.right > ancho - margen) corrida = ancho - margen - r.right
      if (r.left + corrida < margen) corrida = margen - r.left
      g.style.marginLeft = `${corrida}px`
    })
  }

  return (
    <span className={styles.raiz} onMouseEnter={acomodar} onFocus={acomodar}>
      <button type="button" className={styles.icono} aria-label={etiqueta} aria-describedby={id}>
        i
      </button>
      <span ref={globo} role="tooltip" id={id} className={styles.globo}>
        {children}
      </span>
    </span>
  )
}
