import { formatDateCL } from '@/lib/locale'
import type { Solicitud } from '@/features/tomaMuestras'
import styles from './SolicitudDetalleModal.module.css'

interface SolicitudDetalleModalProps {
  solicitud: Solicitud
  onCerrar: () => void
}

function camposGenerales(s: Solicitud): [string, string][] {
  return [
    ['N° Solicitud', s.numero_solicitud],
    ['Fecha Solicitud', formatDateCL(s.fecha_solicitud)],
    ['Laboratorio', s.laboratorio],
    ['Solicitante', s.solicitante],
    ['Sold To', s.sold_to],
    ['Ship To', s.ship_to ?? '—'],
    ['Especie', s.especie ?? '—'],
    ['Variedad', s.variedad ?? '—'],
    ['Línea Proceso', s.linea_proceso ?? '—'],
    ['CSG', s.csg ?? '—'],
    ['Lote', s.lote ?? '—'],
    ['Posición Muestreo', s.posicion_muestreo ?? '—'],
    ['N° Cámara', s.numero_camara ?? '—'],
    ['N° Orden', s.numero_orden ?? '—'],
    ['Kilos Procesados (KG)', s.kilos_procesados != null ? String(s.kilos_procesados) : '—'],
    ['Producto Utilizado', s.producto_utilizado ?? '—'],
    ['Tipo Muestra', s.tipo_muestra ?? '—'],
    ['Fecha Muestreo', s.fecha_muestreo ? formatDateCL(s.fecha_muestreo) : '—'],
    ['Hora Muestreo', s.hora_muestreo ?? '—'],
    ['Nombre Muestreador', s.nombre_muestreador ?? '—'],
    ['Generado Por', s.generado_por],
    ['Email Solicitante', s.email_solicitante ?? '—'],
    ['Email Laboratorio', s.email_laboratorio ?? '—'],
    ['Observación', s.observacion ?? '—'],
  ]
}

export function SolicitudDetalleModal({ solicitud, onCerrar }: SolicitudDetalleModalProps) {
  const campos = [...camposGenerales(solicitud), ...Object.entries(solicitud.campos_laboratorio)]

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
