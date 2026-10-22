import { useState } from 'react'
import styles from './PortalHero.module.css'

interface PortalHeroProps {
  /** Rótulo chico sobre el título; sin él, no se dibuja. */
  etiqueta?: string
  titulo: string
  descripcion: string
  /** Foto de la especie (Report): queda de fondo, bajo un velo verde de la marca para que combine con el entorno. */
  fondo?: string
}

/** Encabezado del portal del cliente. Con `fondo` lleva la foto de la fruta; sin él, solo el degradado de la marca. */
export function PortalHero({ etiqueta, titulo, descripcion, fondo }: PortalHeroProps) {
  // Al cambiar de fruta la foto nueva aparece despacio sobre la anterior (fundido lento), en vez de cambiar de golpe.
  const [capas, setCapas] = useState<string[]>(fondo ? [fondo] : [])
  if (fondo && fondo !== capas[capas.length - 1]) setCapas([...capas.slice(-1), fondo])
  return (
    <section className={`${styles.hero} ${fondo ? styles.conFoto : ''}`}>
      {capas.map((src, i) => (
        <div
          key={src}
          className={`${styles.foto} ${i > 0 ? styles.fotoNueva : ''}`}
          style={{ backgroundImage: `url(${src})` }}
          aria-hidden="true"
        />
      ))}
      {fondo && <div className={styles.velo} aria-hidden="true" />}
      <span className={styles.brillo} aria-hidden="true" />
      <div className={styles.texto}>
        {etiqueta && (
          <span className={styles.etiqueta}>
            <span className={styles.vivo} aria-hidden="true" />
            {etiqueta}
          </span>
        )}
        <h1 className={styles.titulo}>{titulo}</h1>
        <p className={styles.descripcion}>{descripcion}</p>
      </div>
    </section>
  )
}
