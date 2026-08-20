import { formatDateCL } from '@/lib/locale'
import type { Solicitud } from '@/features/tomaMuestras'
import styles from './SolicitudDetalleModal.module.css'

interface SolicitudDetalleModalProps {
  solicitud: Solicitud
  onCerrar: () => void
}

export function SolicitudDetalleModal({ solicitud, onCerrar }: SolicitudDetalleModalProps) {
  const campos: [string, string][] = [
    ['N° Solicitud', solicitud.numero_solicitud],
    ['Fecha de solicitud', formatDateCL(solicitud.fecha_solicitud)],
    ['Generado por', solicitud.generado_por],
    ['Laboratorio', solicitud.laboratorio],
    ['Tipo de aplicación', solicitud.tipo_aplicacion],
  ]

  return (
    <div className={styles.overlay} onClick={onCerrar}>
      <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
        <div className={styles.cabecera}>
          <h3>{solicitud.numero_solicitud}</h3>
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
