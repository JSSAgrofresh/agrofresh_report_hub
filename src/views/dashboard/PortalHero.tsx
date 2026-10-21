import type { CSSProperties } from 'react'
import styles from './PortalHero.module.css'

interface PortalHeroProps {
  etiqueta: string
  titulo: string
  descripcion: string
  /** Foto de la especie (Report): queda de fondo, bajo un velo verde de la marca para que combine con el entorno. */
  fondo?: string
}

/** Encabezado del portal del cliente. Con `fondo` lleva la foto de la fruta; sin él, solo el degradado de la marca. */
export function PortalHero({ etiqueta, titulo, descripcion, fondo }: PortalHeroProps) {
  const estiloFoto: CSSProperties | undefined = fondo ? { backgroundImage: `url(${fondo})` } : undefined
  return (
    <section className={`${styles.hero} ${fondo ? styles.conFoto : ''}`}>
      {fondo && <div className={styles.foto} style={estiloFoto} aria-hidden="true" />}
      {fondo && <div className={styles.velo} aria-hidden="true" />}
      <span className={styles.brillo} aria-hidden="true" />
      <div className={styles.texto}>
        <span className={styles.etiqueta}>
          <span className={styles.vivo} aria-hidden="true" />
          {etiqueta}
        </span>
        <h1 className={styles.titulo}>{titulo}</h1>
        <p className={styles.descripcion}>{descripcion}</p>
      </div>
    </section>
  )
}
