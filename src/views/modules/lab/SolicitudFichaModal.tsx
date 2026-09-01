import type { Solicitud } from '@/features/emitir'
import styles from './SolicitudFichaModal.module.css'

interface SolicitudFichaModalProps {
  solicitud: Solicitud
  onCerrar: () => void
}

export function SolicitudFichaModal({ solicitud, onCerrar }: SolicitudFichaModalProps) {
  const campos = Object.entries(solicitud.campos).filter(
    ([etiqueta, valor]) => valor.trim() !== '' && !etiqueta.startsWith('Resultado:'),
  )

  return (
    <div className={styles.overlay} onClick={onCerrar}>
      <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
        <div className={styles.cabecera}>
          <div>
            <h3>{solicitud.campos['N° Solicitud'] || solicitud.archivo}</h3>
            <p className={styles.resumen}>{solicitud.archivo}</p>
          </div>
          <button className={styles.cerrar} onClick={onCerrar} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <dl className={styles.ficha}>
          {campos.map(([etiqueta, valor]) => (
            <div key={etiqueta} className={styles.campo}>
              <dt>{etiqueta}</dt>
              <dd>{valor}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}
