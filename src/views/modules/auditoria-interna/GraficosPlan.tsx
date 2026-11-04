import { useMemo, useState } from 'react'
import type { AnalisisVisible, SolicitudAuditoria } from '@/features/auditoriaInterna'
import { SEMANAS_PEAK, ordenSemana, propuestoYHechoPorSemana, semanaActual, topClientes } from '@/features/planEntregables'
import type { ClientePlan } from '@/features/planEntregables'
import { COLOR_LAB } from './coloresTipo'
import styles from './GraficosPlan.module.css'

const nf = new Intl.NumberFormat('es-CL')

const ANCHO = 720
const ALTO = 330
const IZQ = 14
const DER = 14
const ARRIBA = 46
const ABAJO = 40

/** «Cuándo se concentra el trabajo»: lo propuesto por semana (barras), lo hecho (línea punteada) y el peak sombreado. */
function GraficoSemanas({ datos }: { datos: ReturnType<typeof propuestoYHechoPorSemana> }) {
  // El 18 % de aire arriba deja sitio al rótulo PEAK sobre la barra más alta.
  const max = Math.max(1, ...datos.map((d) => Math.max(d.propuesto, d.hecho))) * 1.18
  const paso = (ANCHO - IZQ - DER) / datos.length
  const alto = ALTO - ARRIBA - ABAJO
  const y = (v: number) => ARRIBA + alto - (v / max) * alto
  const x = (i: number) => IZQ + paso * i + paso / 2
  const hoy = ordenSemana(semanaActual())
  const peak = SEMANAS_PEAK.map((s) => ordenSemana(s)).filter((i) => i >= 0)
  const linea = datos.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(d.hecho)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} className={styles.svg} role="img" aria-label="Análisis propuestos y hechos por semana">
      {peak.length > 0 && (
        <g>
          <rect x={IZQ + paso * Math.min(...peak)} y={ARRIBA - 22} width={paso * peak.length} height={alto + 22} fill="#fbe9d3" opacity={0.85} />
          <text x={IZQ + paso * (Math.min(...peak) + peak.length / 2)} y={ARRIBA - 6} textAnchor="middle" className={styles.peak}>PEAK</text>
        </g>
      )}
      {datos.map((d, i) => (
        <g key={d.semana}>
          <rect x={x(i) - paso * 0.31} y={y(d.propuesto)} width={paso * 0.62} height={Math.max(0, ARRIBA + alto - y(d.propuesto))} fill="#5b8f1f" rx={1.5} />
          <text x={x(i)} y={y(Math.max(d.propuesto, d.hecho)) - 7} textAnchor="middle" className={styles.valor}>{d.propuesto > 0 ? nf.format(d.propuesto) : ''}</text>
          <text x={x(i)} y={ALTO - ABAJO + 18} textAnchor="middle" className={i === hoy ? styles.ejeHoy : styles.eje}>{`Sem ${d.semana.slice(1)}`}</text>
        </g>
      ))}
      <line x1={IZQ} x2={ANCHO - DER} y1={ARRIBA + alto} y2={ARRIBA + alto} stroke="#d5ddd1" />
      {datos.some((d) => d.hecho > 0) && (
        <g>
          <path d={linea} fill="none" stroke="#26352c" strokeWidth={2.4} strokeDasharray="6 5" />
          {datos.map((d, i) => (d.hecho > 0 ? <circle key={d.semana} cx={x(i)} cy={y(d.hecho)} r={4.5} fill="#26352c"><title>{`${d.semana}: ${d.hecho} hechos de ${d.propuesto} propuestos`}</title></circle> : null))}
        </g>
      )}
      <text x={ANCHO / 2} y={ALTO - 6} textAnchor="middle" className={styles.pie}>Octubre → noviembre → diciembre → enero</text>
    </svg>
  )
}

const SEGMENTOS = [
  { clave: 'agrofresh', nombre: 'Residuales · AgroFresh', color: COLOR_LAB.AGROFRESH },
  { clave: 'quiteca', nombre: 'Residuales · Quiteca', color: COLOR_LAB.QUITECA },
  { clave: 'fsma', nombre: 'FSMA · ALS', color: COLOR_LAB.ALS },
  { clave: 'fito', nombre: 'FITO · Diagnofruit', color: COLOR_LAB.DIAGNOFRUIT },
] as const

/** «Los 10 clientes con más análisis»: cada barra dividida entre Residuales (AgroFresh y Quiteca), FSMA y FITO. */
function GraficoTop({ filas }: { filas: ReturnType<typeof topClientes> }) {
  const max = Math.max(1, ...filas.map((f) => f.total))
  if (filas.length === 0) return <p className={styles.vacio}>Todavía no hay análisis con estos filtros.</p>
  return (
    <div className={styles.top}>
      <ul className={styles.leyenda} aria-label="Colores">
        {SEGMENTOS.map((s) => <li key={s.clave}><i style={{ background: s.color }} />{s.nombre}</li>)}
      </ul>
      {filas.map((f, i) => (
        <div key={f.cliente} className={styles.filaTop}>
          <span className={styles.nombreTop} title={f.cliente}><em>{i + 1}</em>{f.cliente}</span>
          <div className={styles.barraTop} style={{ width: `${(f.total / max) * 100}%` }}>
            {SEGMENTOS.map((s) => (f[s.clave] > 0 ? (
              <span key={s.clave} className={styles.segmento} style={{ flexGrow: f[s.clave], background: s.color }} title={`${s.nombre}: ${f[s.clave]}`}>
                {f[s.clave] / f.total > 0.1 ? f[s.clave] : ''}
              </span>
            ) : null))}
          </div>
          <b className={styles.totalTop}>{nf.format(f.total)}{f.propuesto ? <small> de {nf.format(f.propuesto)}</small> : null}</b>
        </div>
      ))}
    </div>
  )
}

/**
 * Los dos gráficos del plan, plegados por defecto («Ver gráficos»): cuándo se concentra el trabajo (por semana) y los 10 clientes con más
 * análisis, uno al lado del otro.
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
  const semanas = useMemo(() => (abierto ? propuestoYHechoPorSemana(solicitudes, plan, analisis) : []), [abierto, solicitudes, plan, analisis])
  const top = useMemo(() => (abierto ? topClientes(solicitudes, analisis, plan, 10) : []), [abierto, solicitudes, plan, analisis])
  const conSemanas = semanas.some((d) => d.propuesto > 0 || d.hecho > 0)
  return (
    <section className={styles.contenedor} aria-label="Gráficos del plan">
      <button type="button" className={styles.boton} aria-expanded={abierto} onClick={() => setAbierto((a) => !a)}>
        <span aria-hidden="true">{abierto ? '▾' : '▸'}</span> {abierto ? 'Ocultar gráficos' : 'Ver gráficos'}
        <small>cuándo se concentra el trabajo · los 10 clientes con más análisis</small>
      </button>
      {abierto && (
        <div className={styles.rejilla}>
          <article className={styles.tarjeta}>
            <h3>Cuándo se concentra el trabajo</h3>
            <p className={styles.sub}>Análisis propuestos por semana{semanas.some((d) => d.hecho > 0) ? ' y los que ya se hicieron' : ''}; el peak está en las semanas 49 y 50</p>
            {conSemanas ? <GraficoSemanas datos={semanas} /> : <p className={styles.vacio}>Sin plan por semana: falta la migración 0073 y subir el Excel final.</p>}
            <ul className={styles.leyendaSemanas}>
              <li><i className={styles.barra} /> Propuesto</li>
              <li><i className={styles.linea} /> Hecho</li>
            </ul>
          </article>
          <article className={styles.tarjeta}>
            <h3>Los 10 clientes con más análisis</h3>
            <p className={styles.sub}>Análisis hechos por Sold To, divididos por laboratorio{plan ? ' · «de N» = lo propuesto por el plan' : ''}</p>
            <GraficoTop filas={top} />
          </article>
        </div>
      )}
    </section>
  )
}
