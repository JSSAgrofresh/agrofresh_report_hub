import type { CSSProperties } from 'react'
import type { AreaConfig } from '@/constants/areas'
import styles from './AreaHero.module.css'

interface AreaHeroProps {
  area: AreaConfig
  titulo: string
  descripcion: string
  /** Reemplaza el fondo del área (ej. Report cambiando la foto según la fruta filtrada). */
  fondo?: string
  /** Color del degradado. Por defecto el de marca del área; se pasa distinto
   * cuando el fondo es una foto con su propio tono (ver fondoParaEspecie). */
  tinte?: string
}

/**
 * Banner de identidad por área: la foto de fondo queda como acento decorativo
 * detrás de un degradado del color de marca, para que nunca compita con la
 * legibilidad del texto ni con las tarjetas que van debajo.
 */
export function AreaHero({ area, titulo, descripcion, fondo, tinte }: AreaHeroProps) {
  const oscuro = tinte ?? area.colorOscuro
  const estilo: CSSProperties = {
    backgroundImage: [
      `linear-gradient(100deg, ${oscuro}F0 0%, ${oscuro}CC 32%, ${oscuro}66 68%, ${oscuro}33 100%)`,
      `url(${fondo ?? area.fondo})`,
    ].join(', '),
  }

  return (
    <div className={styles.hero} style={estilo}>
      <span className={styles.etiqueta}>{area.nombre}</span>
      <h1 className={styles.titulo}>{titulo}</h1>
      <p className={styles.descripcion}>{descripcion}</p>
    </div>
  )
}
