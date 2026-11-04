import type { ReactNode } from 'react'
import styles from './AuditoriaHero.module.css'

/** Encabezado sobrio del Panel de control interno: título y descripción sobre una franja plana, con un
 * filo de color a la izquierda (verde en el panel, azul en la vista de límites) y, a la derecha, las acciones de la pantalla. */
export function AuditoriaHero({
  etiqueta,
  titulo,
  descripcion,
  tono = 'verde',
  acciones,
}: {
  etiqueta: string
  titulo: string
  descripcion: string
  tono?: 'verde' | 'azul'
  acciones?: ReactNode
}) {
  return (
    <header className={`${styles.hero} ${tono === 'azul' ? styles.azul : ''}`}>
      <div className={styles.texto}>
        <span className={styles.etiqueta}>{etiqueta}</span>
        <h1 className={styles.titulo}>{titulo}</h1>
        <p className={styles.descripcion}>{descripcion}</p>
      </div>
      {acciones && <div className={styles.acciones}>{acciones}</div>}
    </header>
  )
}
