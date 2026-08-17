import { formatDateCL, formatDecimalCL } from '@/lib/locale'
import type { Observacion } from '@/features/reportes'
import styles from './DetalleObservacionesModal.module.css'

const MAX_FILAS = 200

interface DetalleObservacionesModalProps {
  titulo: string
  filas: Observacion[]
  onCerrar: () => void
}

export function DetalleObservacionesModal({ titulo, filas, onCerrar }: DetalleObservacionesModalProps) {
  const conPpm = filas.filter((o): o is Observacion & { ppm: number } => o.ppm != null)
  const promedio = conPpm.length ? conPpm.reduce((a, o) => a + o.ppm, 0) / conPpm.length : null
  const ordenadas = [...filas].sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? ''))
  const visibles = ordenadas.slice(0, MAX_FILAS)

  return (
    <div className={styles.overlay} onClick={onCerrar}>
      <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
        <div className={styles.cabecera}>
          <div>
            <h3>{titulo}</h3>
            <p className={styles.resumen}>
              {filas.length.toLocaleString('es-CL')} observación(es)
              {promedio != null && ` · promedio ${formatDecimalCL(promedio, 4)} ppm (${conPpm.length} con valor numérico)`}
            </p>
          </div>
          <button className={styles.cerrar} onClick={onCerrar} aria-label="Cerrar">
            ✕
          </button>
        </div>

        {filas.length === 0 ? (
          <p className={styles.vacio}>No hay observaciones para este punto.</p>
        ) : (
          <div className={styles.tablaScroll}>
            <table className={styles.tabla}>
              <thead>
                <tr>
                  <th>N° informe</th>
                  <th>Fecha</th>
                  <th>Semana</th>
                  <th>Ingrediente</th>
                  <th>ppm</th>
                  <th>Cliente</th>
                  <th>Sucursal</th>
                  <th>Tipo servicio</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((o, i) => (
                  <tr key={`${o.solicitudId}-${o.ingrediente}-${i}`}>
                    <td>{o.nroSolicitud || '—'}</td>
                    <td>{o.fecha ? formatDateCL(o.fecha) : '—'}</td>
                    <td>{o.semana ?? '—'}</td>
                    <td className={styles.codigo}>{o.ingrediente ?? 'Sin resultado'}</td>
                    <td className={o.ppm == null ? styles.sinValor : undefined}>
                      {o.ppm != null ? formatDecimalCL(o.ppm, 4) : (o.valorTexto ?? '—')}
                    </td>
                    <td className={styles.truncada}>{o.cliente ?? '—'}</td>
                    <td className={styles.truncada}>{o.planta ?? '—'}</td>
                    <td className={styles.truncada}>{o.tipoServicio ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filas.length > visibles.length && (
          <p className={styles.masNota}>
            Mostrando los primeros {visibles.length.toLocaleString('es-CL')} de {filas.length.toLocaleString('es-CL')}.
          </p>
        )}
      </div>
    </div>
  )
}
