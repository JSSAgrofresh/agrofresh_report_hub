import styles from './PortalHero.module.css'

/** Encabezado del panel del cliente: reemplaza al banner con foto del área. Mismo título y descripción de siempre. */
export function PortalHero({ etiqueta, titulo, descripcion }: { etiqueta: string; titulo: string; descripcion: string }) {
  return (
    <section className={styles.hero}>
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
