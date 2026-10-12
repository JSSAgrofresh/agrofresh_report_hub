import styles from './AuditoriaHero.module.css'

/** Banner propio de Auditoría interna: en vez de la foto de una fruta, un
 * motivo de control: hojas con su visto bueno, una lupa y una cuadrícula
 * de fondo. Todo en SVG/CSS, sin imágenes que cargar. */
export function AuditoriaHero({ titulo, descripcion }: { titulo: string; descripcion: string }) {
  return (
    <div className={styles.hero}>
      <svg className={styles.arte} viewBox="0 0 420 120" preserveAspectRatio="xMaxYMid slice" aria-hidden="true" focusable="false">
        <defs>
          <pattern id="auditoria-grilla" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M20 0H0V20" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="420" height="120" fill="url(#auditoria-grilla)" />
        <g transform="translate(205 18) rotate(-7)">
          <rect width="64" height="82" rx="7" fill="rgba(255,255,255,0.10)" stroke="rgba(255,255,255,0.28)" />
          <path d="M12 20h40M12 32h40M12 44h26" stroke="rgba(255,255,255,0.35)" strokeWidth="3" strokeLinecap="round" />
          <circle cx="48" cy="62" r="9" fill="#34c38f" />
          <path d="M43.5 62.5l3.2 3.2 5.8-6.4" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </g>
        <g transform="translate(262 28) rotate(4)">
          <rect width="64" height="82" rx="7" fill="rgba(255,255,255,0.14)" stroke="rgba(255,255,255,0.32)" />
          <path d="M12 20h40M12 32h40M12 44h30" stroke="rgba(255,255,255,0.4)" strokeWidth="3" strokeLinecap="round" />
          <circle cx="48" cy="62" r="9" fill="#34c38f" />
          <path d="M43.5 62.5l3.2 3.2 5.8-6.4" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </g>
        <g transform="translate(322 22) rotate(10)">
          <rect width="64" height="82" rx="7" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.22)" strokeDasharray="4 4" />
          <path d="M12 20h40M12 32h40M12 44h22" stroke="rgba(255,255,255,0.28)" strokeWidth="3" strokeLinecap="round" />
          <circle cx="48" cy="62" r="9" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeDasharray="3 3" />
        </g>
        <g transform="translate(360 52)" stroke="#fff" fill="none" strokeLinecap="round">
          <circle cx="16" cy="16" r="16" strokeWidth="4" fill="rgba(255,255,255,0.12)" />
          <path d="M28 28l16 16" strokeWidth="6" />
        </g>
      </svg>
      <span className={styles.etiqueta}>Auditoría interna</span>
      <h1 className={styles.titulo}>{titulo}</h1>
      <p className={styles.descripcion}>{descripcion}</p>
    </div>
  )
}
