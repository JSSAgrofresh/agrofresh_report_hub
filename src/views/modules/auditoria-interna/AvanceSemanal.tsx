import { useMemo, useState } from 'react'
import { ANALISIS_VISIBLES } from '@/features/auditoriaInterna'
import type { AnalisisVisible, SolicitudAuditoria } from '@/features/auditoriaInterna'
import { SEMANAS_PLAN, avanceSemanal, semanaActual, sumarAvance } from '@/features/planEntregables'
import type { CeldaAvance, CeldasAvance, ClientePlan, FilaPlan, VersionPlan } from '@/features/planEntregables'
import { COLOR_LAB } from './coloresTipo'
import styles from './AvanceSemanal.module.css'

const nf = new Intl.NumberFormat('es-CL')

const GRUPOS: { clave: FilaPlan; nombre: string; color: string; labs: string }[] = [
  { clave: 'residuales', nombre: 'Residuales', color: '#4d7c0f', labs: 'AgroFresh · Quiteca' },
  { clave: 'fsma', nombre: 'FSMA', color: COLOR_LAB.ALS, labs: 'ALS' },
  { clave: 'fito', nombre: 'FITO', color: COLOR_LAB.DIAGNOFRUIT, labs: 'Diagnofruit' },
]

/** Lo hecho contra lo que tocaba: verde si se cumplió, ámbar si falta, gris si nada tocaba. */
function estado(c: CeldaAvance): 'cumple' | 'falta' | 'nada' {
  if (c.debia <= 0) return 'nada'
  return c.hecho >= c.debia ? 'cumple' : 'falta'
}

function Celdas({ celdas, grupo }: { celdas: CeldasAvance; grupo: (typeof GRUPOS)[number] }) {
  const c = celdas[grupo.clave]
  const e = estado(c)
  const vacio = c.hecho === 0 && c.debia === 0
  const pct = c.debia > 0 ? `${Math.round((c.hecho / c.debia) * 100)}%` : '—'
  return (
    <>
      {grupo.clave === 'residuales' && (
        <>
          <td title="Análisis hechos en AgroFresh">{vacio ? '–' : nf.format(c.agrofresh ?? 0)}</td>
          <td title="Análisis hechos en Quiteca">{vacio ? '–' : nf.format(c.quiteca ?? 0)}</td>
        </>
      )}
      <td className={styles.hecho} title="Análisis hechos">{vacio ? '–' : nf.format(c.hecho)}</td>
      <td className={styles.debia} title="Lo que tocaba según el plan">{c.debia > 0 ? nf.format(c.debia) : '–'}</td>
      <td className={`${styles.pct} ${styles[e]}`} title={e === 'falta' ? `Faltan ${nf.format(c.debia - c.hecho)}` : undefined}>{pct}</td>
    </>
  )
}

/**
 * «Análisis por cliente» semana a semana: por cliente y por planta, los análisis hechos (por laboratorio) contra lo que tocaba según el plan
 * de entregables, en UNA semana de la temporada o acumulado hasta ella.
 */
export function AvanceSemanal({
  solicitudes,
  plan,
  analisis = ANALISIS_VISIBLES,
  limite = 0,
}: {
  solicitudes: SolicitudAuditoria[]
  plan: Map<string, ClientePlan>
  analisis?: AnalisisVisible[]
  limite?: number
}) {
  // Solo cuenta el entregable propuesto (el original ya no se considera).
  const version: VersionPlan = 'propuesta'
  const [modo, setModo] = useState<'semana' | 'acumulado'>('semana')
  const [hasta, setHasta] = useState<string>(() => semanaActual())
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())
  const hayDetalle = useMemo(() => [...plan.values()].some((c) => (c.semanas ?? []).length > 0), [plan])

  const todos = useMemo(
    () => avanceSemanal(solicitudes, plan, { version, hasta, modo, analisis }),
    [solicitudes, plan, hasta, modo, analisis],
  )
  const filas = limite > 0 ? todos.slice(0, limite) : todos
  const total = useMemo(() => sumarAvance(todos), [todos])
  const alternar = (c: string) =>
    setAbiertos((prev) => {
      const sig = new Set(prev)
      if (!sig.delete(c)) sig.add(c)
      return sig
    })
  const grupos = GRUPOS.filter((g) => analisis.includes(g.clave))
  const columnas = grupos.reduce((n, g) => n + (g.clave === 'residuales' ? 5 : 3), 1)

  return (
    <section className={styles.cuerpo} aria-label="Avance semanal del plan">
      <div className={styles.barra}>
        <div className={styles.grupo}>
          <span>Ver</span>
          <div className={styles.seg} role="group" aria-label="Semana o acumulado">
            <button type="button" aria-pressed={modo === 'semana'} onClick={() => setModo('semana')}>Una semana</button>
            <button type="button" aria-pressed={modo === 'acumulado'} onClick={() => setModo('acumulado')}>Acumulado</button>
          </div>
        </div>
        <label className={styles.grupo}>
          <span>{modo === 'semana' ? 'Semana' : 'Hasta la semana'}</span>
          <select aria-label="Semana" value={hasta} onChange={(e) => setHasta(e.target.value)}>
            {SEMANAS_PLAN.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>

      {!hayDetalle ? (
        <p className={styles.vacio}>El plan cargado no trae el detalle por semana. Corre la migración 0073 y vuelve a subir el Excel en Administración General → Plan de entregables.</p>
      ) : (
        <div className={styles.caja}>
          <table className={styles.tabla}>
            <thead>
              <tr className={styles.grupos}>
                <th rowSpan={2} className={styles.colCliente}>Cliente · planta</th>
                {grupos.map((g) => (
                  <th key={g.clave} colSpan={g.clave === 'residuales' ? 5 : 3} style={{ '--c': g.color } as React.CSSProperties}>
                    {g.nombre}<small>{g.labs}</small>
                  </th>
                ))}
              </tr>
              <tr className={styles.subs}>
                {grupos.map((g) => (
                  <ThGrupo key={g.clave} grupo={g.clave} />
                ))}
              </tr>
            </thead>
            {filas.map((c) => (
              <tbody key={c.cliente} className={styles.bloque}>
                <tr className={styles.filaCliente}>
                  <th scope="row" className={styles.cliente}>
                    <span title={c.cliente}>{c.cliente}</span>
                    {c.plantas.length > 0 && (
                      <button type="button" className={styles.plantas} aria-expanded={abiertos.has(c.cliente)} onClick={() => alternar(c.cliente)}>
                        {abiertos.has(c.cliente) ? 'Ocultar' : 'Ver'} {c.plantas.length} {c.plantas.length === 1 ? 'planta' : 'plantas'}
                      </button>
                    )}
                    {!c.conPlan && <small className={styles.sinPlan}>fuera del plan</small>}
                  </th>
                  {grupos.map((g) => <Celdas key={g.clave} celdas={c.celdas} grupo={g} />)}
                </tr>
                {abiertos.has(c.cliente) && c.plantas.map((p) => (
                  <tr key={p.planta ?? '·'} className={styles.filaPlanta}>
                    <th scope="row" className={styles.planta} title={p.planta === null ? 'Análisis hechos cuyo Ship To no se pudo cruzar con una planta del plan' : p.planta}>
                      {p.planta ?? 'Sin cruzar con una planta del plan'}
                    </th>
                    {grupos.map((g) => <Celdas key={g.clave} celdas={p.celdas} grupo={g} />)}
                  </tr>
                ))}
              </tbody>
            ))}
            {filas.length > 0 && (
              <tfoot>
                <tr className={styles.filaTotal}>
                  <th scope="row" className={styles.cliente}>
                    Total<small className={styles.sinPlan}>{nf.format(todos.length)} clientes</small>
                  </th>
                  {grupos.map((g) => <Celdas key={g.clave} celdas={total} grupo={g} />)}
                </tr>
              </tfoot>
            )}
          </table>
          {filas.length === 0 && <p className={styles.vacio} data-columnas={columnas}>Nada prometido ni hecho en {modo === 'semana' ? 'esa semana' : 'ese período'}.</p>}
        </div>
      )}
    </section>
  )
}

function ThGrupo({ grupo }: { grupo: FilaPlan }) {
  return (
    <>
      {grupo === 'residuales' && <><th>AgroFresh</th><th>Quiteca</th></>}
      <th>Hecho</th>
      <th title="Lo que tocaba según el plan">Debía</th>
      <th title="Hecho ÷ lo que tocaba">%</th>
    </>
  )
}
