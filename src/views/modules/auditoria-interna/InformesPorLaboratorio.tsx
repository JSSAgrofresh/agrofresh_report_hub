import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth'
import { ROUTES } from '@/constants/routes'
import { SIN_LABORATORIO, pendientesDeInforme, porLaboratorio } from '@/features/auditoriaInterna'
import type { SolicitudAuditoria } from '@/features/auditoriaInterna'
import { dejarFiltrosPendientes } from './irAPendientes'
import { ESTADOS } from './estados'
import styles from './InformesPorLaboratorio.module.css'

const nf = new Intl.NumberFormat('es-CL')
const DIA_MS = 24 * 60 * 60 * 1000
// Mismo color por entidad que el resto del panel: verde = informe recibido.
const VERDE = ESTADOS.concretada.color
const R = 42
const CIRCUNFERENCIA = 2 * Math.PI * R

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

function Anillo({ pct }: { pct: number }) {
  return (
    <svg className={styles.anillo} viewBox="0 0 100 100" role="img" aria-label={`${Math.round(pct)}% con informe`}>
      <circle cx="50" cy="50" r={R} fill="none" stroke="rgba(0,0,0,0.09)" strokeWidth="11" />
      <circle
        cx="50" cy="50" r={R} fill="none" stroke={VERDE} strokeWidth="11" strokeLinecap="round"
        strokeDasharray={`${(pct / 100) * CIRCUNFERENCIA} ${CIRCUNFERENCIA}`} transform="rotate(-90 50 50)"
      />
      <text x="50" y="56" textAnchor="middle" className={styles.anilloTexto}>{Math.round(pct)}%</text>
    </svg>
  )
}

/** Informes recibidos contra solicitudes emitidas, por laboratorio, y la lista
 * de las solicitudes que siguen esperando su informe. Recibido = el informe
 * (PDF) ya está guardado, tenga o no sus resultados en Report. «Ver detalle»
 * abre Solicitudes e informes con los filtros de «Sin informe» puestos. */
export function InformesPorLaboratorio({ solicitudes }: { solicitudes: SolicitudAuditoria[] }) {
  const { user } = useAuth()
  const navegar = useNavigate()
  const [abierto, setAbierto] = useState<string | null>(null)
  // El listado de pendientes parte plegado: solo se despliega si se pide.
  const [verLista, setVerLista] = useState(false)
  const filas = useMemo(
    () => porLaboratorio(solicitudes).map((l) => ({ ...l, informes: l.concretadas + l.sinReport })),
    [solicitudes],
  )
  const pendientes = useMemo(() => pendientesDeInforme(solicitudes), [solicitudes])
  const nombreLab = (s: SolicitudAuditoria) => (s.laboratorio ?? '').trim() || SIN_LABORATORIO
  const visibles = abierto ? pendientes.filter((s) => nombreLab(s) === abierto) : pendientes
  const maximo = Math.max(1, ...filas.map((l) => l.emitidas))

  const verDetalle = (laboratorio: string | null) => {
    dejarFiltrosPendientes(user?.email, laboratorio && laboratorio !== SIN_LABORATORIO ? laboratorio : null)
    navegar(ROUTES.tomaMuestras)
  }

  return (
    <section className={styles.seccion} aria-labelledby="informes-por-lab">
      <header className={styles.cabecera}>
        <div>
          <h2 id="informes-por-lab">Informes vs. solicitudes por laboratorio</h2>
          <p>{nf.format(pendientes.length)} solicitudes esperan su informe.</p>
        </div>
        <button type="button" className={styles.botonDetalle} onClick={() => verDetalle(null)}>
          Ver detalle de todas →
        </button>
      </header>

      <div className={styles.tarjetas}>
        {filas.map((l) => {
          const pct = l.emitidas ? (l.informes / l.emitidas) * 100 : 0
          const activo = abierto === l.laboratorio
          return (
            <article key={l.laboratorio} className={`${styles.tarjeta} ${activo ? styles.activa : ''}`}>
              <div className={styles.tarjetaCab}>
                <h3>{l.laboratorio}</h3>
                <Anillo pct={pct} />
              </div>
              <p className={styles.cifra}>
                <b>{nf.format(l.informes)}</b> de {nf.format(l.emitidas)} con informe
              </p>
              {/* El largo de la barra es proporcional al laboratorio con más solicitudes. */}
              <div className={styles.barra} style={{ width: `${(l.emitidas / maximo) * 100}%` }} aria-hidden="true">
                <span className={styles.barraOk} style={{ flex: l.informes }} />
                <span className={styles.barraPend} style={{ flex: l.pendientes }} />
              </div>
              <p className={styles.pendientes}>
                {l.pendientes > 0 ? <><b>{nf.format(l.pendientes)}</b> pendientes de informe</> : 'Sin pendientes'}
              </p>
              <div className={styles.acciones}>
                <button type="button" className={styles.enlace} aria-pressed={activo} onClick={() => { setAbierto(activo ? null : l.laboratorio); setVerLista(!activo) }}>
                  {activo ? 'Ver todos' : 'Listar pendientes'}
                </button>
                <button type="button" className={styles.botonDetalle} disabled={l.pendientes === 0} onClick={() => verDetalle(l.laboratorio)}>
                  Ver detalle →
                </button>
              </div>
            </article>
          )
        })}
      </div>

      <div className={styles.listaCard}>
        <button type="button" className={styles.plegable} aria-expanded={verLista} onClick={() => setVerLista((v) => !v)}>
          <span className={styles.subtitulo}>
            Pendientes de informe{abierto ? ` · ${abierto}` : ''} ({nf.format(visibles.length)})
          </span>
          <span className={styles.chevron} aria-hidden="true">{verLista ? '▲' : '▼'}</span>
          <span className={styles.accionPlegable}>{verLista ? 'Ocultar' : 'Mostrar'}</span>
        </button>
        {!verLista ? null : visibles.length === 0 ? (
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
      </div>
    </section>
  )
}
