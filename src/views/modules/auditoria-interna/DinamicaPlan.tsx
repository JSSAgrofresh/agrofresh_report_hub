import { useMemo, useState } from 'react'
import { ANALISIS_VISIBLES } from '@/features/auditoriaInterna'
import type { AnalisisVisible, SolicitudAuditoria } from '@/features/auditoriaInterna'
import {
  SEMANAS_PEAK, SEMANAS_PLAN, aplanarDinamica, clavesConHijos, construirDinamica, ordenSemana, semanaActual, totalDe,
} from '@/features/planEntregables'
import type { CeldaDinamica, ClientePlan, FilaPlan, NodoDinamica } from '@/features/planEntregables'
import { COLOR_LAB } from './coloresTipo'
import styles from './DinamicaPlan.module.css'

const nf = new Intl.NumberFormat('es-CL')
type Valor = 'ambos' | 'propuesto' | 'hecho'

const LINEAS: { clave: FilaPlan; nombre: string; sub: string; color: string }[] = [
  { clave: 'residuales', nombre: 'Residuales', sub: 'AgroFresh · Quiteca', color: '#4d7c0f' },
  { clave: 'fsma', nombre: 'FSMA', sub: 'ALS', color: COLOR_LAB.ALS },
  { clave: 'fito', nombre: 'FITO', sub: 'Diagnofruit', color: COLOR_LAB.DIAGNOFRUIT },
]

const vacia = (): CeldaDinamica => ({ hecho: 0, prop: 0, agrofresh: 0, quiteca: 0 })
function mas(a: CeldaDinamica, b: CeldaDinamica): CeldaDinamica {
  return { hecho: a.hecho + b.hecho, prop: a.prop + b.prop, agrofresh: a.agrofresh + b.agrofresh, quiteca: a.quiteca + b.quiteca }
}

/** Lo que se ve en una celda según lo que se quiere mirar (hecho / propuesto, o los dos). */
function Valor({ c, valor, semana, actual }: { c: CeldaDinamica; valor: Valor; semana: string | null; actual: number }) {
  if (c.hecho === 0 && c.prop === 0) return <td className={styles.vacia}>·</td>
  // Una semana que aún no llega no se juzga: lo prometido todavía se puede cumplir.
  const pasada = semana === null || ordenSemana(semana) <= actual
  const estado = valor !== 'ambos' || c.prop === 0 || !pasada ? '' : c.hecho >= c.prop ? styles.cumple : styles.falta
  const texto = valor === 'propuesto' ? nf.format(c.prop) : valor === 'hecho' ? nf.format(c.hecho) : `${nf.format(c.hecho)}/${nf.format(c.prop)}`
  const detalle = `Hecho ${c.hecho} de ${c.prop} propuestos${c.agrofresh + c.quiteca > 0 ? ` · AgroFresh ${c.agrofresh} · Quiteca ${c.quiteca}` : ''}`
  return <td className={`${styles.celda} ${estado}`} title={detalle}>{texto}</td>
}

/**
 * «Análisis por cliente» semana a semana, como una tabla dinámica: Comercial → Tipo de cliente → Cliente → Planta, con las semanas de la
 * temporada en columnas y, en cada cliente y planta, una línea por análisis. Cada celda dice lo hecho y lo propuesto por el plan.
 */
export function DinamicaPlan({
  solicitudes,
  plan,
  analisis = ANALISIS_VISIBLES,
}: {
  solicitudes: SolicitudAuditoria[]
  plan: Map<string, ClientePlan>
  analisis?: AnalisisVisible[]
}) {
  const [valor, setValor] = useState<Valor>('ambos')
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())
  const actual = useMemo(() => ordenSemana(semanaActual()), [])
  const hayDetalle = useMemo(() => [...plan.values()].some((c) => (c.semanas ?? []).length > 0), [plan])
  const arbol = useMemo(() => construirDinamica(solicitudes, plan), [solicitudes, plan])
  const lineas = LINEAS.filter((l) => analisis.includes(l.clave))
  const filas = useMemo(() => aplanarDinamica(arbol, abiertos, analisis), [arbol, abiertos, analisis])
  const alternar = (clave: string) =>
    setAbiertos((prev) => {
      const sig = new Set(prev)
      if (!sig.delete(clave)) sig.add(clave)
      return sig
    })

  /** Una celda por semana de un renglón: de un solo análisis, o la suma de todos los visibles. */
  const semanas = (n: NodoDinamica, serv: FilaPlan | null) =>
    SEMANAS_PLAN.map((s) => {
      const c = (serv ? [serv] : lineas.map((l) => l.clave)).reduce((a, k) => mas(a, n.datos[k][s] ?? vacia()), vacia())
      return <Valor key={s} c={c} valor={valor} semana={s} actual={actual} />
    })
  const total = (n: NodoDinamica, serv: FilaPlan | null) => {
    const c = (serv ? [serv] : lineas.map((l) => l.clave)).reduce((a, k) => mas(a, totalDe(n.datos, k)), vacia())
    return <Valor c={c} valor={valor} semana={null} actual={actual} />
  }

  const celdaNombre = (n: NodoDinamica, nivel: number, filasAlto?: number) => (
    <th scope={filasAlto ? 'rowgroup' : 'row'} rowSpan={filasAlto} className={`${styles.nombre} ${styles[`n_${n.nivel}`]}`} style={{ paddingLeft: 8 + nivel * 18 }}>
      {n.hijos.length > 0 ? (
        <button type="button" className={styles.flecha} aria-expanded={abiertos.has(n.clave)} aria-label={`${abiertos.has(n.clave) ? 'Cerrar' : 'Abrir'} ${n.nombre}`} onClick={() => alternar(n.clave)}>
          {abiertos.has(n.clave) ? '▾' : '▸'}
        </button>
      ) : <span className={styles.sinFlecha} />}
      <span className={styles.texto} title={n.nombre}>{n.nombre}</span>
      {n.fueraDelPlan && n.nivel === 'cliente' && <small className={styles.fuera}>fuera del plan</small>}
    </th>
  )

  const fila = (n: NodoDinamica, nivel: number) => {
    // Comercial y tipo: una sola línea con todo junto. Cliente y planta: una línea por análisis, como la tabla de siempre.
    if (n.nivel === 'comercial' || n.nivel === 'tipo') {
      return (
        <tr key={n.clave} className={`${styles.fila} ${styles[`f_${n.nivel}`]}`}>
          {celdaNombre(n, nivel)}
          <td className={styles.analisis}>Todos</td>
          {semanas(n, null)}
          {total(n, null)}
        </tr>
      )
    }
    const ls = lineas.filter((l) => { const t = totalDe(n.datos, l.clave); return t.hecho > 0 || t.prop > 0 })
    return ls.map((l, j) => (
      <tr key={`${n.clave}-${l.clave}`} className={`${styles.fila} ${styles[`f_${n.nivel}`]}`}>
        {j === 0 && celdaNombre(n, nivel, ls.length)}
        <td className={styles.analisis} style={{ color: l.color }} title={l.sub}>{l.nombre}</td>
        {semanas(n, l.clave)}
        {total(n, l.clave)}
      </tr>
    ))
  }

  const granTotal: NodoDinamica = useMemo(() => {
    const t: NodoDinamica = { clave: 'total', nombre: 'Total', nivel: 'comercial', datos: { residuales: {}, fsma: {}, fito: {} }, hijos: [] }
    for (const r of arbol) for (const k of ['residuales', 'fsma', 'fito'] as FilaPlan[]) for (const [s, c] of Object.entries(r.datos[k])) {
      t.datos[k][s] = mas(t.datos[k][s] ?? vacia(), c)
    }
    return t
  }, [arbol])

  return (
    <section className={styles.cuerpo} aria-label="Tabla dinámica por semana">
      <div className={styles.barra}>
        <div className={styles.grupo}>
          <span>Mostrar</span>
          <div className={styles.seg} role="group" aria-label="Qué mostrar en las celdas">
            <button type="button" aria-pressed={valor === 'ambos'} onClick={() => setValor('ambos')} title="Lo hecho sobre lo propuesto">Hecho / Propuesto</button>
            <button type="button" aria-pressed={valor === 'propuesto'} onClick={() => setValor('propuesto')}>Propuesto</button>
            <button type="button" aria-pressed={valor === 'hecho'} onClick={() => setValor('hecho')}>Hecho</button>
          </div>
        </div>
        <div className={styles.grupo}>
          <button type="button" className={styles.boton} onClick={() => setAbiertos(new Set(clavesConHijos(arbol)))}>Abrir todo</button>
          <button type="button" className={styles.boton} onClick={() => setAbiertos(new Set())}>Cerrar todo</button>
        </div>
        <span className={styles.leyenda}><i className={styles.puntoOk} /> cumplido <i className={styles.puntoFalta} /> falta (semanas que ya pasaron)</span>
      </div>

      {!hayDetalle ? (
        <p className={styles.vacio}>El plan cargado no trae el detalle por semana. Corre la migración 0073 y vuelve a subir el Excel en Administración General → Plan de entregables.</p>
      ) : (
        <div className={styles.caja}>
          <table className={styles.tabla}>
            <thead>
              <tr>
                <th className={styles.colNombre}>Comercial · tipo · cliente · planta</th>
                <th className={styles.colAnalisis}>Análisis</th>
                {SEMANAS_PLAN.map((s) => (
                  <th key={s} className={`${styles.colSemana} ${SEMANAS_PEAK.includes(s) ? styles.peak : ''} ${ordenSemana(s) === actual ? styles.hoy : ''}`} title={SEMANAS_PEAK.includes(s) ? 'Semana peak' : ordenSemana(s) === actual ? 'Esta semana' : undefined}>
                    {s}
                  </th>
                ))}
                <th className={styles.colTotal}>Total</th>
              </tr>
            </thead>
            <tbody>
              {filas.map(({ nodo, nivel }) => fila(nodo, nivel))}
            </tbody>
            {filas.length > 0 && (
              <tfoot>
                <tr className={styles.filaTotal}>
                  <th scope="row" className={styles.nombre}><span className={styles.sinFlecha} />Total</th>
                  <td className={styles.analisis}>Todos</td>
                  {semanas(granTotal, null)}
                  {total(granTotal, null)}
                </tr>
              </tfoot>
            )}
          </table>
          {filas.length === 0 && <p className={styles.vacio}>Nada prometido ni hecho con estos filtros.</p>}
        </div>
      )}
    </section>
  )
}
