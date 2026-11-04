import { useCallback, useMemo, useState } from 'react'
import type { AnalisisVisible, SolicitudAuditoria } from '@/features/auditoriaInterna'
import { SEMANAS_PEAK, detalleDeCliente, ordenSemana, propuestoYHechoPorSemana, semanaActual, tipoLegible, topClientes } from '@/features/planEntregables'
import type { ClientePlan } from '@/features/planEntregables'
import { Modal } from '@/components/ui/Modal'
import { COLOR_LAB } from './coloresTipo'
import styles from './GraficosPlan.module.css'

const nf = new Intl.NumberFormat('es-CL')

const ANCHO = 720
const ALTO = 330
const IZQ = 14
const DER = 14
const ARRIBA = 46
const ABAJO = 40

/**
 * Las semanas de la temporada en barras. «esperado» = lo que el plan propone cada semana (con el peak sombreado); «llevamos» = lo que ya se hizo,
 * con una marca en lo que se esperaba esa semana para contrastar. Los dos usan la MISMA escala (`max`) para poder compararlos a simple vista.
 */
function GraficoSemanas({ datos, modo, max }: { datos: ReturnType<typeof propuestoYHechoPorSemana>; modo: 'esperado' | 'llevamos'; max: number }) {
  const tope = Math.max(1, max) * 1.18 // aire arriba para el rótulo PEAK y los números
  const paso = (ANCHO - IZQ - DER) / datos.length
  const alto = ALTO - ARRIBA - ABAJO
  const y = (v: number) => ARRIBA + alto - (v / tope) * alto
  const x = (i: number) => IZQ + paso * i + paso / 2
  const hoy = ordenSemana(semanaActual())
  const peak = SEMANAS_PEAK.map((s) => ordenSemana(s)).filter((i) => i >= 0)
  const valor = (d: (typeof datos)[number]) => (modo === 'esperado' ? d.propuesto : d.hecho)
  const color = modo === 'esperado' ? '#5b8f1f' : '#1f6f8b'
  return (
    <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} className={styles.svg} role="img" aria-label={modo === 'esperado' ? 'Análisis propuestos por semana' : 'Análisis hechos por semana, contra lo esperado'}>
      {peak.length > 0 && (
        <g>
          <rect x={IZQ + paso * Math.min(...peak)} y={ARRIBA - 22} width={paso * peak.length} height={alto + 22} fill="#fbe9d3" opacity={0.85} />
          <text x={IZQ + paso * (Math.min(...peak) + peak.length / 2)} y={ARRIBA - 6} textAnchor="middle" className={styles.peak}>PEAK</text>
        </g>
      )}
      {datos.map((d, i) => (
        <g key={d.semana}>
          <rect x={x(i) - paso * 0.31} y={y(valor(d))} width={paso * 0.62} height={Math.max(0, ARRIBA + alto - y(valor(d)))} fill={color} rx={1.5}>
            <title>{modo === 'esperado' ? `${d.semana}: ${d.propuesto} propuestos` : `${d.semana}: ${d.hecho} hechos de ${d.propuesto} esperados`}</title>
          </rect>
          {modo === 'llevamos' && d.propuesto > 0 && (
            <line x1={x(i) - paso * 0.38} x2={x(i) + paso * 0.38} y1={y(d.propuesto)} y2={y(d.propuesto)} stroke="#b45309" strokeWidth={2.6} strokeDasharray="4 3" />
          )}
          <text x={x(i)} y={y(modo === 'llevamos' ? Math.max(d.hecho, d.propuesto) : valor(d)) - 7} textAnchor="middle" className={styles.valor}>
            {modo === 'esperado' ? (d.propuesto > 0 ? nf.format(d.propuesto) : '') : (d.hecho > 0 || ordenSemana(d.semana) <= hoy) && d.propuesto + d.hecho > 0 ? nf.format(d.hecho) : ''}
          </text>
          <text x={x(i)} y={ALTO - ABAJO + 18} textAnchor="middle" className={i === hoy ? styles.ejeHoy : styles.eje}>{`Sem ${d.semana.slice(1)}`}</text>
        </g>
      ))}
      <line x1={IZQ} x2={ANCHO - DER} y1={ARRIBA + alto} y2={ARRIBA + alto} stroke="#d5ddd1" />
      <text x={ANCHO / 2} y={ALTO - 6} textAnchor="middle" className={styles.pie}>Octubre → noviembre → diciembre → enero</text>
    </svg>
  )
}

const SEGMENTOS = [
  { clave: 'agrofresh', nombre: 'Residuales · AgroFresh', corto: 'AgroFresh', color: COLOR_LAB.AGROFRESH },
  { clave: 'quiteca', nombre: 'Residuales · Quiteca', corto: 'Quiteca', color: COLOR_LAB.QUITECA },
  { clave: 'fsma', nombre: 'FSMA · ALS', corto: 'FSMA', color: COLOR_LAB.ALS },
  { clave: 'fito', nombre: 'FITO · Diagnofruit', corto: 'FITO', color: COLOR_LAB.DIAGNOFRUIT },
] as const

/** «Los 10 clientes con más análisis»: cada barra dividida entre Residuales (AgroFresh y Quiteca), FSMA y FITO. Un clic en una barra abre su detalle. */
function GraficoTop({ filas, onElegir }: { filas: ReturnType<typeof topClientes>; onElegir: (cliente: string) => void }) {
  const max = Math.max(1, ...filas.map((f) => f.total))
  if (filas.length === 0) return <p className={styles.vacio}>Todavía no hay análisis con estos filtros.</p>
  return (
    <div className={styles.top}>
      <ul className={styles.leyenda} aria-label="Colores">
        {SEGMENTOS.map((s) => <li key={s.clave}><i style={{ background: s.color }} />{s.nombre}</li>)}
      </ul>
      {filas.map((f, i) => (
        <button key={f.cliente} type="button" className={styles.filaTop} onClick={() => onElegir(f.cliente)} aria-label={`Ver el detalle de ${f.cliente}`} title="Ver el detalle por sucursal">
          <span className={styles.nombreTop}><em>{i + 1}</em><span>{f.cliente}</span></span>
          <span className={styles.barraTop} style={{ width: `${(f.total / max) * 100}%` }}>
            {SEGMENTOS.map((s) => (f[s.clave] > 0 ? (
              <span key={s.clave} className={styles.segmento} style={{ flexGrow: f[s.clave], background: s.color }} title={`${s.nombre}: ${f[s.clave]}`}>
                {f[s.clave] / f.total > 0.1 ? f[s.clave] : ''}
              </span>
            ) : null))}
          </span>
          <b className={styles.totalTop}>{nf.format(f.total)}{f.propuesto ? <small> de {nf.format(f.propuesto)}</small> : null}</b>
        </button>
      ))}
      <p className={styles.pista}>Toca una barra para ver el detalle de ese cliente por sucursal.</p>
    </div>
  )
}

/** El detalle de un cliente: por sucursal, sus análisis hechos por laboratorio y lo que el plan propone. */
function DetalleClienteModal({ detalle, onCerrar }: { detalle: ReturnType<typeof detalleDeCliente>; onCerrar: () => void }) {
  const max = Math.max(1, ...detalle.plantas.map((p) => p.total))
  const partes = [detalle.comercial, detalle.tipo ? tipoLegible(detalle.tipo) : null].filter(Boolean).join(' · ')
  return (
    <Modal titulo={detalle.cliente} subtitulo={partes || undefined} onCerrar={onCerrar} ancho="medio">
      <div className={styles.resumenModal}>
        <div><b>{nf.format(detalle.total)}</b><span>análisis hechos</span></div>
        <div><b>{detalle.propuesto ? nf.format(detalle.propuesto) : '—'}</b><span>propuestos por el plan</span></div>
        <div><b>{detalle.propuesto ? `${Math.round((detalle.total / detalle.propuesto) * 100)}%` : '—'}</b><span>avance</span></div>
        <div><b>{detalle.plantas.length}</b><span>{detalle.plantas.length === 1 ? 'sucursal' : 'sucursales'}</span></div>
      </div>
      {detalle.plantas.length === 0 ? (
        <p className={styles.vacio}>Este cliente no tiene análisis con los filtros actuales.</p>
      ) : (
        <div className={styles.cajaModal}>
          <table className={styles.tablaModal}>
            <thead>
              <tr>
                <th className={styles.izq}>Sucursal (Ship To)</th>
                <th className={styles.colBarra}>Reparto por laboratorio</th>
                {SEGMENTOS.map((s) => <th key={s.clave} title={s.nombre}><i style={{ background: s.color }} />{s.corto}</th>)}
                <th>Hechos</th>
                <th>Plan</th>
                <th>Avance</th>
              </tr>
            </thead>
            <tbody>
              {detalle.plantas.map((p) => (
                <tr key={p.planta}>
                  <th scope="row" className={styles.izq}>{p.planta}</th>
                  <td className={styles.colBarra}>
                    <span className={styles.barraModal} style={{ width: `${(p.total / max) * 100}%` }}>
                      {SEGMENTOS.map((s) => (p[s.clave] > 0 ? <span key={s.clave} style={{ flexGrow: p[s.clave], background: s.color }} title={`${s.nombre}: ${p[s.clave]}`} /> : null))}
                    </span>
                  </td>
                  {SEGMENTOS.map((s) => <td key={s.clave}>{p[s.clave] > 0 ? p[s.clave] : <span className={styles.cero}>·</span>}</td>)}
                  <td><b>{nf.format(p.total)}</b></td>
                  <td>{p.propuesto ? nf.format(p.propuesto) : <span className={styles.cero}>—</span>}</td>
                  <td>{p.propuesto ? `${Math.round((p.total / p.propuesto) * 100)}%` : <span className={styles.cero}>—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}

/**
 * Los gráficos del plan, plegados por defecto («Ver gráficos»): a la izquierda las semanas —arriba lo que LLEVAMOS contra lo esperado y abajo lo
 * que se espera (cuándo se concentra el trabajo)— y a la derecha los 10 clientes con más análisis, cuyas barras se pueden abrir para ver el detalle.
 */
export function GraficosPlan({
  solicitudes,
  plan,
  analisis,
  abiertoInicial = false,
}: {
  solicitudes: SolicitudAuditoria[]
  plan: Map<string, ClientePlan> | null
  analisis: AnalisisVisible[]
  abiertoInicial?: boolean
}) {
  const [abierto, setAbierto] = useState(abiertoInicial)
  const [elegido, setElegido] = useState<string | null>(null)
  const semanas = useMemo(() => (abierto ? propuestoYHechoPorSemana(solicitudes, plan, analisis) : []), [abierto, solicitudes, plan, analisis])
  const top = useMemo(() => (abierto ? topClientes(solicitudes, analisis, plan, 10) : []), [abierto, solicitudes, plan, analisis])
  const detalle = useMemo(() => (elegido ? detalleDeCliente(solicitudes, plan, elegido, analisis) : null), [elegido, solicitudes, plan, analisis])
  const conSemanas = semanas.some((d) => d.propuesto > 0 || d.hecho > 0)
  const max = Math.max(1, ...semanas.map((d) => Math.max(d.propuesto, d.hecho)))
  const cerrar = useCallback(() => setElegido(null), [])
  return (
    <section className={styles.contenedor} aria-label="Gráficos del plan">
      <button type="button" className={styles.boton} aria-expanded={abierto} onClick={() => setAbierto((a) => !a)}>
        <span aria-hidden="true">{abierto ? '▾' : '▸'}</span> {abierto ? 'Ocultar gráficos' : 'Ver gráficos'}
        <small>lo que llevamos · cuándo se concentra el trabajo · los 10 clientes con más análisis</small>
      </button>
      {abierto && (
        <div className={styles.rejilla}>
          <div className={styles.columna}>
            <article className={styles.tarjeta}>
              <h3>Lo que llevamos</h3>
              <p className={styles.sub}>Análisis hechos por semana; la marca naranja es lo que se esperaba esa semana</p>
              {conSemanas ? <GraficoSemanas datos={semanas} modo="llevamos" max={max} /> : <p className={styles.vacio}>Sin plan por semana: falta la migración 0073 y subir el Excel final.</p>}
              <ul className={styles.leyendaSemanas}>
                <li><i className={styles.barraLlevamos} /> Hecho</li>
                <li><i className={styles.marca} /> Esperado esa semana</li>
              </ul>
            </article>
            <article className={styles.tarjeta}>
              <h3>Cuándo se concentra el trabajo</h3>
              <p className={styles.sub}>Análisis propuestos por semana; el peak está en las semanas 49 y 50</p>
              {conSemanas ? <GraficoSemanas datos={semanas} modo="esperado" max={max} /> : null}
              <ul className={styles.leyendaSemanas}>
                <li><i className={styles.barra} /> Propuesto por el plan</li>
              </ul>
            </article>
          </div>
          <article className={styles.tarjeta}>
            <h3>Los 10 clientes con más análisis</h3>
            <p className={styles.sub}>Análisis hechos por Sold To, divididos por laboratorio{plan ? ' · «de N» = lo propuesto por el plan' : ''}</p>
            <GraficoTop filas={top} onElegir={setElegido} />
          </article>
        </div>
      )}
      {detalle && <DetalleClienteModal detalle={detalle} onCerrar={cerrar} />}
    </section>
  )
}
