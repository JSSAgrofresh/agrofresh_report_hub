import type { ReactNode } from 'react'
import styles from './EstadoModulo.module.css'

interface EstadoModuloProps {
  titulo: string
  etiqueta: string
  descripcion: string
  icono?: ReactNode
}

const ICONO_DEFECTO = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export function EstadoModulo({ titulo, etiqueta, descripcion, icono }: EstadoModuloProps) {
  return (
    <div className={styles.wrap}>
      <div className={styles.circulo}>{icono ?? ICONO_DEFECTO}</div>
      <span className={styles.etiqueta}>{etiqueta}</span>
      <h2 className={styles.titulo}>{titulo}</h2>
      <p className={styles.descripcion}>{descripcion}</p>
    </div>
  )
}
