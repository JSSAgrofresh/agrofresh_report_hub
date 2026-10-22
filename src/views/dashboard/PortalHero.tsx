import { useEffect, useState } from 'react'
import styles from './PortalHero.module.css'

interface PortalHeroProps {
  /** Rótulo chico sobre el título; sin él, no se dibuja. */
  etiqueta?: string
  titulo: string
  descripcion: string
  /** Foto de la especie (Report): queda de fondo, bajo un velo verde de la marca para que combine con el entorno. */
  fondo?: string
  /** Varias fotos (las especies de la cuenta): pasan una tras otra con el mismo fundido. Con una sola o ninguna, queda `fondo`. */
  fondos?: string[]
}

/** Cada cuántos milisegundos cambia la foto del carrusel. */
const PASO_CARRUSEL_MS = 6500

/** Encabezado del portal del cliente. Con `fondo` lleva la foto de la fruta; sin él, solo el degradado de la marca. */
export function PortalHero({ etiqueta, titulo, descripcion, fondo: fondoFijo, fondos }: PortalHeroProps) {
  const lista = fondos && fondos.length > 1 ? fondos : null
  const claveLista = lista ? lista.join('|') : ''
  const [paso, setPaso] = useState(0)
  useEffect(() => {
    if (!claveLista) return
    const id = window.setInterval(() => setPaso((p) => p + 1), PASO_CARRUSEL_MS)
    return () => window.clearInterval(id)
  }, [claveLista])
  const fondo = lista ? lista[paso % lista.length] : fondoFijo
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
