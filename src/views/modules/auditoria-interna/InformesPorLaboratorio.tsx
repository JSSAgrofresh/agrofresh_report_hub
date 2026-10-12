import { useMemo, useState } from 'react'
import { SIN_LABORATORIO, pendientesDeInforme, porLaboratorio } from '@/features/auditoriaInterna'
import type { SolicitudAuditoria } from '@/features/auditoriaInterna'
import styles from './InformesPorLaboratorio.module.css'

const nf = new Intl.NumberFormat('es-CL')
const DIA_MS = 24 * 60 * 60 * 1000

function diasDesde(iso: string | null): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : Math.max(0, Math.floor((Date.now() - t) / DIA_MS))
}

function fechaCorta(iso: string | null): string {
  if (!iso) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : iso
}

/** Informes recibidos contra solicitudes emitidas, por laboratorio, y la lista
 * de las solicitudes que siguen esperando su informe. Recibido = el informe
 * (PDF) ya está guardado, tenga o no sus resultados en Report. */
export function InformesPorLaboratorio({ solicitudes }: { solicitudes: SolicitudAuditoria[] }) {
  const [abierto, setAbierto] = useState<string | null>(null)
  const filas = useMemo(
    () => porLaboratorio(solicitudes).map((l) => ({ ...l, informes: l.concretadas + l.sinReport })),
    [solicitudes],
  )
  const pendientes = useMemo(() => pendientesDeInforme(solicitudes), [solicitudes])
  const nombreLab = (s: SolicitudAuditoria) => (s.laboratorio ?? '').trim() || SIN_LABORATORIO
  const visibles = abierto ? pendientes.filter((s) => nombreLab(s) === abierto) : pendientes

  return (
    <section className={styles.tarjeta} aria-labelledby="informes-por-lab">
      <header className={styles.cabecera}>
        <h2 id="informes-por-lab">Informes vs. solicitudes por laboratorio</h2>
        <p>
          {nf.format(pendientes.length)} solicitudes esperan su informe. Haz clic en un laboratorio para listar solo las suyas.
        </p>
      </header>

      <table className={styles.tabla}>
        <thead>
          <tr>
            <th>Laboratorio</th>
            <th className={styles.num}>Solicitudes</th>
            <th className={styles.num}>Informes recibidos</th>
            <th className={styles.num}>Pendientes de informe</th>
            <th>Avance</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((l) => {
            const pct = l.emitidas ? (l.informes / l.emitidas) * 100 : 0
            const activo = abierto === l.laboratorio
            return (
              <tr key={l.laboratorio} className={activo ? styles.activa : undefined}>
                <td>
                  <button
                    type="button"
                    className={styles.labBoton}
                    aria-pressed={activo}
                    onClick={() => setAbierto(activo ? null : l.laboratorio)}
                  >
                    {l.laboratorio}
                  </button>
                </td>
                <td className={styles.num}>{nf.format(l.emitidas)}</td>
                <td className={styles.num}>{nf.format(l.informes)}</td>
                <td className={styles.num}><b>{nf.format(l.pendientes)}</b></td>
                <td>
                  <span className={styles.barra} aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>
                  <span className={styles.pct}>{Math.round(pct)}%</span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <h3 className={styles.subtitulo}>
        Pendientes de informe{abierto ? ` · ${abierto}` : ''} ({nf.format(visibles.length)})
      </h3>
      {visibles.length === 0 ? (
        <p className={styles.vacio}>No hay solicitudes pendientes de informe.</p>
      ) : (
        <div className={styles.scroll}>
          <table className={styles.tabla}>
            <thead>
              <tr>
                <th>Solicitud</th>
                <th>Laboratorio</th>
                <th>Cliente · Planta</th>
                <th>Emitida</th>
                <th className={styles.num}>Días</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((s) => {
                const dias = diasDesde(s.emitida_en ?? s.fecha_solicitud)
                return (
                  <tr key={s.archivo}>
                    <td>{s.numero_solicitud ?? s.archivo}</td>
                    <td>{nombreLab(s)}</td>
                    <td>{[s.sold_to, s.ship_to].filter(Boolean).join(' · ') || '—'}</td>
                    <td>{fechaCorta(s.emitida_en ?? s.fecha_solicitud)}</td>
                    <td className={styles.num}>{dias ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
