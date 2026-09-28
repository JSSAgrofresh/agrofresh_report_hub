import type { CSSProperties } from 'react'
import type { AreaConfig } from '@/constants/areas'
import { tinteDeFoto } from '../lib/fondoEspecie'
import styles from './AreaHero.module.css'

interface AreaHeroProps {
  area: AreaConfig
  titulo: string
  descripcion: string
  /** Reemplaza el fondo del área (ej. Report cambiando la foto según la fruta filtrada). */
  fondo?: string
  /** Color del degradado. Si no se pasa, sale de la foto (cerezas -> rojo
   * cereza, ver tinteDeFoto) y, si la foto no tiene tono propio, del color de
   * marca del área. */
  tinte?: string
}

/**
 * Banner de identidad por área: la foto de fondo queda como acento decorativo
 * detrás de un degradado del color de marca, para que nunca compita con la
 * legibilidad del texto ni con las tarjetas que van debajo.
 */
export function AreaHero({ area, titulo, descripcion, fondo, tinte }: AreaHeroProps) {
  const imagen = fondo ?? area.fondo
  const oscuro = tinte ?? tinteDeFoto(imagen) ?? area.colorOscuro
  const estilo: CSSProperties = {
    backgroundImage: [
      `linear-gradient(100deg, ${oscuro}F0 0%, ${oscuro}CC 32%, ${oscuro}66 68%, ${oscuro}33 100%)`,
      `url(${imagen})`,
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
