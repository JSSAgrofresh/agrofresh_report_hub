import { fechaHora } from '@/lib/fechaHoraChile'
import type { Historial, RegistroEnvio } from '@/features/envioInformes'
import styles from './EnvioInformes.module.css'

function resumenDestino(r: RegistroEnvio): string {
  const cuantos = r.para.length
  return `${cuantos} ${cuantos === 1 ? 'destinatario' : 'destinatarios'}`
}

/** Los últimos envíos, con a quién se PIDIÓ enviar y si salió de verdad o fue
 * una prueba. Sin la migración 0052 no hay registro y se dice. */
export function HistorialEnvios({ historial }: { historial: Historial | null }) {
  if (!historial) return <p className={styles.vacio}>Cargando historial…</p>
  if (!historial.disponible) {
    return (
      <p className={styles.vacio}>
        El historial todavía no está activo: falta aplicar la migración 0052 en el servidor. Los envíos funcionan igual.
      </p>
    )
  }
  if (!historial.items.length) return <p className={styles.vacio}>Todavía no se ha enviado ningún informe.</p>

  return (
    <div className={styles.tablaScroll}>
      <table className={styles.tabla}>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Enviado por</th>
            <th>Laboratorio</th>
            <th>Planta</th>
            <th>Archivos</th>
            <th>Destino</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {historial.items.map((r) => (
            <tr key={r.id}>
              <td className={styles.celdaFecha}>{fechaHora(r.creado_en)}</td>
              <td>{r.usuario_nombre ?? '—'}</td>
              <td>{r.laboratorio ?? '—'}</td>
              <td>
                <span className={styles.celdaPlanta}>{r.ship_to ?? '—'}</span>
                <span className={styles.celdaSub}>{r.sold_to}{r.especie ? ` · ${r.especie}` : ''}</span>
              </td>
              <td>{r.adjuntos.map((a) => a.nombre).join(', ') || '—'}</td>
              <td title={r.para.join(', ')}>{resumenDestino(r)}</td>
              <td>
                {!r.exitoso ? (
                  <span className={`${styles.estado} ${styles.estadoError}`} title={r.error ?? undefined}>Falló</span>
                ) : r.modo === 'prueba' ? (
                  <span className={`${styles.estado} ${styles.estadoPrueba}`} title={`Salió a ${r.enviado_to.join(', ')}`}>Prueba</span>
                ) : (
                  <span className={`${styles.estado} ${styles.estadoOk}`}>Enviado</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
