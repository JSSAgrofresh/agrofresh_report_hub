import { useEffect, useMemo, useState } from 'react'
import { listarClientes } from '@/features/catalogo'
import { ANALISIS_VISIBLES, clientesSinAnalisis, porClienteResiduosFsmaFito, soloAnalisis } from '@/features/auditoriaInterna'
import type { AnalisisVisible, CeldaCliente, DimensionGrafico, SolicitudAuditoria } from '@/features/auditoriaInterna'
import { avancePlan, cantidadPlan, normalizarNombre } from '@/features/planEntregables'
import type { ClientePlan, FilaPlan } from '@/features/planEntregables'
import { COLOR_LAB } from './coloresTipo'
import styles from './AnalisisPorCliente.module.css'

const nf = new Intl.NumberFormat('es-CL')

type Linea = { clave: string; plan?: FilaPlan; nombre: string; sub?: string; c: CeldaCliente; color: string; labs?: { agf: CeldaCliente; qui: CeldaCliente } }
type Cuatro = { agrofresh: CeldaCliente; quiteca: CeldaCliente; fsma: CeldaCliente; fito: CeldaCliente }

/**
 * Las líneas de un cliente (o del total): Residuales (con su reparto entre AgroFresh y Quiteca), FSMA y FITO.
 * Sale una línea si tiene análisis O si el plan de entregables le promete algo de ese análisis (`prometido`): así lo prometido
 * se ve aunque todavía no se haya hecho ninguno (entonces los análisis hechos quedan en 0).
 */
function lineasDe(x: Cuatro, prometido: (fila: FilaPlan) => boolean = () => false): Linea[] {
  const res: CeldaCliente = { n: x.agrofresh.n + x.quiteca.n, informes: x.agrofresh.informes + x.quiteca.informes }
  const out: Linea[] = []
  if (res.n > 0 || prometido('residuales')) out.push({ clave: 'res', nombre: 'Residuales', c: res, color: '#4d7c0f', plan: 'residuales', labs: { agf: x.agrofresh, qui: x.quiteca } })
  if (x.fsma.n > 0 || prometido('fsma')) out.push({ clave: 'fsma', nombre: 'FSMA', sub: 'ALS', c: x.fsma, color: COLOR_LAB.ALS, plan: 'fsma' })
  if (x.fito.n > 0 || prometido('fito')) out.push({ clave: 'fito', nombre: 'FITO', sub: 'Diagnofruit', c: x.fito, color: COLOR_LAB.DIAGNOFRUIT, plan: 'fito' })
  return out
}

const CERO: CeldaCliente = { n: 0, informes: 0 }

const pct = (v: number) => `${Math.round(v * 100)}%`

/** Un laboratorio en la misma línea de Residuales: su nombre, la cantidad y el % del total de residuales, sobre un fondo de su color. */
function CeldasLab({ nombre, c, total, color }: { nombre: string; c: CeldaCliente; total: number; color: string }) {
  const fondo = { background: `${color}1f` }
  const vacio = c.n === 0
  return (
    <>
      <td className={styles.labNombre} style={{ ...fondo, color }}>{nombre}</td>
      <td className={styles.labCant} style={fondo} >{vacio ? '–' : nf.format(c.n)}</td>
      <td className={styles.labPct} style={fondo}>{vacio ? '–' : pct(c.n / total)}</td>
    </>
  )
}

/** Lo prometido en las dos versiones del plan (original y propuesta) y lo que llevamos hecho. */
type Entregable = { original: number | null; propuesta: number | null; hechosOriginal: number; hechosPropuesta: number }

/** Cantidad prometida y % de avance de UNA versión del entregable. */
function CeldasEntregable({ cant, hechos, version }: { cant: number | null; hechos: number; version: 'original' | 'propuesta' }) {
  const nombre = version === 'original' ? 'Entregable original' : 'Entregable propuesto'
  const avance = avancePlan(hechos, cant)
  return (
    <>
      {cant === null ? (
        <td className={styles.pendienteDato} title={`${nombre}: el plan no trae este análisis para este cliente`}>—</td>
      ) : (
        <td className={styles.valor} title={`${nombre}: análisis prometidos en la temporada`}><b className={styles.cifra}>{nf.format(cant)}</b></td>
      )}
      {avance === null ? (
        <td className={styles.pendienteDato}>—</td>
      ) : (
        <td className={styles.pct} title={`${nf.format(hechos)} de ${nf.format(cant ?? 0)} (${nombre.toLowerCase()})`}>{pct(avance)}</td>
      )}
    </>
  )
}

/** Las celdas de una línea: análisis, reparto por laboratorio (residuales, en la misma línea), total y entregables (original y propuesto). */
function CeldasLinea({ l, entregable }: { l: Linea; entregable?: Entregable | false }) {
  return (
    <>
      <th scope="row" className={styles.lineaGrupo} style={{ color: l.color }}>
        {l.nombre}
      </th>
      {l.labs ? (
        <>
          <CeldasLab nombre="AGROFRESH" c={l.labs.agf} total={l.c.n} color={COLOR_LAB.AGROFRESH} />
          <CeldasLab nombre="QUITECA" c={l.labs.qui} total={l.c.n} color={COLOR_LAB.QUITECA} />
        </>
      ) : (
        <td colSpan={6} className={styles.cero}>{l.sub}</td>
      )}
      <td className={styles.valor} >
        <b className={styles.cifra}>{nf.format(l.c.n)}</b>
      </td>
      {entregable !== undefined && entregable !== false && (
        <>
          <CeldasEntregable cant={entregable.original} hechos={entregable.hechosOriginal} version="original" />
          <CeldasEntregable cant={entregable.propuesta} hechos={entregable.hechosPropuesta} version="propuesta" />
        </>
      )}
    </>
  )
}

/**
 * El cuerpo del gráfico «Análisis por cliente»: cada cliente hacia abajo, el que más
 * análisis lleva primero, con el detalle: una fila por análisis (Residuales con su reparto por laboratorio en columnas, cantidad y % del total de residuales, FSMA y FITO),
 * con su total, los dos entregables (original y propuesto) y el % de cada uno. Los clientes del listado que todavía no tienen ningún análisis salen al final,
 * apagados (solo cuando se agrupa por Sold To).
 * «Entregables» = lo que cada comercial concretó de cada análisis para cada planta: ese dato
 * se carga aparte (plan de entregables), por ahora queda en blanco.
 */
export function AnalisisPorCliente({
  solicitudes,
  dimension = 'cliente',
  limite = 0,
  analisis = ANALISIS_VISIBLES,
  plan = null,
}: {
  solicitudes: SolicitudAuditoria[]
  dimension?: DimensionGrafico
  /** cuántas filas mostrar (0 = todas) */
  limite?: number
  /** qué análisis se ven (por defecto los tres); el total y el orden de cada cliente cuentan solo lo visible */
  analisis?: AnalisisVisible[]
  /** Lo prometido por Sold To (plan de entregables). Solo se usa agrupando por Sold To: por Ship To, especie o tipo no se calcula y las columnas se esconden. */
  plan?: Map<string, ClientePlan> | null
}) {
  const conPlan = dimension === 'cliente' && plan !== null
  const planDe = (cliente: string) => plan?.get(normalizarNombre(cliente))
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())
  const alternarPlantas = (cliente: string) =>
    setAbiertos((prev) => {
      const sig = new Set(prev)
      if (!sig.delete(cliente)) sig.add(cliente)
      return sig
    })
  // Sin filtrar por análisis: sirve para saber qué clientes del listado no tienen NINGÚN análisis.
  const crudas = useMemo(() => porClienteResiduosFsmaFito(solicitudes, dimension), [solicitudes, dimension])
  const todas = useMemo(() => soloAnalisis(crudas, analisis), [crudas, analisis])
  /** Qué análisis se están viendo: lo prometido de un análisis oculto no se muestra ni se suma. */
  const visible = (fila: FilaPlan) => analisis.includes(fila)
  /** Cuánto se le promete a un cliente de un análisis (en cualquiera de las dos versiones). */
  const prometidoA = (cliente: string, fila: FilaPlan) =>
    visible(fila) && ((cantidadPlan(planDe(cliente), fila, 'original') ?? 0) > 0 || (cantidadPlan(planDe(cliente), fila, 'propuesta') ?? 0) > 0)
  // Con plan, también cuentan los clientes que el plan trae y todavía no tienen ningún análisis (con sus análisis hechos en 0):
  // así el total refleja TODO lo cargado, no solo lo de quienes ya tienen informes.
  const todasConPlan = useMemo(() => {
    if (!conPlan || !plan) return todas
    const presentes = new Set(todas.map((f) => normalizarNombre(f.cliente)))
    const sinAnalisis = [...plan.values()]
      .filter((c) => !presentes.has(normalizarNombre(c.sold_to)))
      .filter((c) => (['residuales', 'fsma', 'fito'] as const).some((fila) => prometidoA(c.sold_to, fila)))
      .map((c) => ({ cliente: c.sold_to, total: 0, informes: 0, agrofresh: CERO, quiteca: CERO, fsma: CERO, fito: CERO }))
      .sort((a, b) => a.cliente.localeCompare(b.cliente, 'es'))
    return [...todas, ...sinAnalisis]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todas, conPlan, plan, analisis])
  const filas = useMemo(() => (limite > 0 ? todasConPlan.slice(0, limite) : todasConPlan), [todasConPlan, limite])
  const [listado, setListado] = useState<string[]>([])
  const [verApagados, setVerApagados] = useState(false)

  // El listado de clientes (Listados): sirve para mostrar, apagados, los que aún no tienen análisis.
  useEffect(() => {
    let cancelado = false
    listarClientes()
      .then((cs) => { if (!cancelado) setListado(cs.filter((c) => c.activo !== false).map((c) => c.nombre)) })
      .catch(() => undefined)
    return () => { cancelado = true }
  }, [])
  const apagados = useMemo(() => {
    if (dimension !== 'cliente') return []
    const sinAnalisis = clientesSinAnalisis(listado, crudas)
    // Los que el plan trae ya salen arriba como filas normales.
    return conPlan && plan ? sinAnalisis.filter((n) => !plan.has(normalizarNombre(n))) : sinAnalisis
  }, [listado, crudas, dimension, conPlan, plan])

  // El Total suma TODOS los clientes (no solo los del «Top N» que se ven), para que refleje el plan completo.
  const suma = (f: (x: (typeof filas)[number]) => CeldaCliente) => todasConPlan.reduce((n, x) => n + f(x).n, 0)
  const nFsma = suma((x) => x.fsma)
  const nFito = suma((x) => x.fito)
  const nTotal = todasConPlan.reduce((n, x) => n + x.total, 0)
  const filasConLineas = useMemo(
    () => filas.filter((f) => lineasDe(f, (fila) => prometidoA(f.cliente, fila)).length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filas, plan, analisis],
  )
  /** Entregables de una fila del gráfico: lo prometido y lo hecho, contando solo los clientes que el plan trae. */
  const entregableDe = (f: (typeof filas)[number], l: Linea): Entregable => ({
    original: l.plan ? cantidadPlan(planDe(f.cliente), l.plan, 'original') : null,
    propuesta: l.plan ? cantidadPlan(planDe(f.cliente), l.plan, 'propuesta') : null,
    hechosOriginal: l.c.n,
    hechosPropuesta: l.c.n,
  })
  /** Total de una fila del gráfico: cada versión suma solo los clientes que ESA versión trae, y lo hecho cuenta solo esos mismos. */
  const entregableTotal = (l: Linea): Entregable => {
    const sumar = (version: 'original' | 'propuesta') => {
      let cant = 0
      let hechos = 0
      for (const f of todasConPlan) {
        const c = l.plan && visible(l.plan) ? cantidadPlan(planDe(f.cliente), l.plan, version) : null
        if (c === null) continue
        cant += c
        hechos += l.plan === 'residuales' ? f.agrofresh.n + f.quiteca.n : l.plan === 'fsma' ? f.fsma.n : f.fito.n
      }
      return { cant: cant > 0 ? cant : null, hechos }
    }
    const o = sumar('original')
    const p = sumar('propuesta')
    return { original: o.cant, propuesta: p.cant, hechosOriginal: o.hechos, hechosPropuesta: p.hechos }
  }

  return (
    <section className={styles.cuerpoGrafico} aria-label="Análisis por cliente">
      <div className={styles.caja}>
        <table className={styles.tabla}>
          <colgroup>
            <col style={{ width: '22%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '10%' }} /><col style={{ width: '5%' }} /><col style={{ width: '6%' }} />
            <col style={{ width: '10%' }} /><col style={{ width: '5%' }} /><col style={{ width: '6%' }} />
            <col style={{ width: '9%' }} />
            {conPlan && <><col style={{ width: '6%' }} /><col style={{ width: '5%' }} /><col style={{ width: '6%' }} /><col style={{ width: '5%' }} /></>}
          </colgroup>
          <thead>
            <tr className={styles.grupos}>
              <th rowSpan={2} className={styles.colCliente}>{dimension === 'cliente' ? 'Cliente' : 'Grupo'}</th>
              <th rowSpan={2} className={styles.colAnalisis}>Análisis</th>
              <th colSpan={6} className={styles.gResiduales}>Laboratorio · cantidad y % del total de residuales</th>
              <th rowSpan={2} className={styles.gTotal}>Total</th>
              {conPlan && <th colSpan={2} className={styles.gEntregable} title="Lo que había entregado el comercial (archivo de entregables, columna Original)">Entregable original</th>}
              {conPlan && <th colSpan={2} className={styles.gEntregable} title="La propuesta del plan de entregables (columna Propuesta)">Entregable propuesto</th>}
            </tr>
            <tr className={styles.subs}>
              <th>Lab.</th><th>Cant.</th><th>%</th>
              <th>Lab.</th><th>Cant.</th><th>%</th>
              {conPlan && <th className={styles.gEntregable} title="Análisis del entregable original">Cant.</th>}
              {conPlan && <th className={styles.gEntregable} title="Lo que llevamos ÷ el entregable original">%</th>}
              {conPlan && <th className={styles.gEntregable} title="Análisis del entregable propuesto">Cant.</th>}
              {conPlan && <th className={styles.gEntregable} title="Lo que llevamos ÷ el entregable propuesto">%</th>}
            </tr>
          </thead>
          {filasConLineas.map((f, i) => {
            const ls = lineasDe(f, (fila) => prometidoA(f.cliente, fila))
            return (
              <tbody key={f.cliente} className={styles.bloque}>
                {ls.map((l, j) => (
                  <tr key={l.clave} className={styles.filaGrupo}>
                    {j === 0 && (
                      <th scope="rowgroup" rowSpan={ls.length} className={styles.cliente}>
                        <em className={i < 3 ? styles.podio : undefined} data-puesto={i < 3 ? i + 1 : undefined}>{i + 1}</em>
                        <span title={f.cliente}>{f.cliente}</span>
                        <small className={styles.totalCliente}>{nf.format(f.total)} análisis</small>
                        {conPlan && (planDe(f.cliente)?.plantas.length ?? 0) > 0 && (
                          <button type="button" className={styles.verPlantas} aria-expanded={abiertos.has(f.cliente)} onClick={() => alternarPlantas(f.cliente)}>
                            {abiertos.has(f.cliente) ? 'Ocultar' : 'Ver'} las {planDe(f.cliente)?.plantas.length} del plan
                          </button>
                        )}
                      </th>
                    )}
                    <CeldasLinea l={l} entregable={conPlan && entregableDe(f, l)} />
                  </tr>
                ))}
                {conPlan && abiertos.has(f.cliente) && (
                  <tr className={styles.filaPlantas}>
                    <td colSpan={12}>
                      <span className={styles.plantasTitulo}>Por planta del plan (original / propuesto)</span>
                      {planDe(f.cliente)?.plantas.map((p, k) => (
                        <span key={k} className={styles.planta}>{p.planta} · {p.servicio === 'residuales' ? 'Residuales' : p.servicio === 'fsma' ? 'FSMA' : p.servicio === 'fito' ? 'FITO' : 'Otro'} <b>{nf.format(p.original)} / {nf.format(p.propuesta)}</b></span>
                      ))}
                    </td>
                  </tr>
                )}
              </tbody>
            )
          })}
          {verApagados && (
            <tbody>
              {apagados.map((nombre) => (
                <tr key={nombre} className={styles.apagado}>
                  <th scope="row" className={styles.cliente}><em>·</em><span title={nombre}>{nombre}</span></th>
                  <td colSpan={conPlan ? 12 : 8}><span className={styles.cero}>Sin análisis</span></td>
                </tr>
              ))}
            </tbody>
          )}
          {filasConLineas.length > 0 && (
            <tfoot>
              {(() => {
                const tot = lineasDe(
                  {
                    agrofresh: { n: suma((x) => x.agrofresh), informes: todasConPlan.reduce((n, x) => n + x.agrofresh.informes, 0) },
                    quiteca: { n: suma((x) => x.quiteca), informes: todasConPlan.reduce((n, x) => n + x.quiteca.informes, 0) },
                    fsma: { n: nFsma, informes: todasConPlan.reduce((n, x) => n + x.fsma.informes, 0) },
                    fito: { n: nFito, informes: todasConPlan.reduce((n, x) => n + x.fito.informes, 0) },
                  },
                  (fila) => conPlan && todasConPlan.some((f) => prometidoA(f.cliente, fila)),
                )
                return tot.map((l, j) => (
                  <tr key={l.clave} className={styles.filaGrupo}>
                    {j === 0 && <th scope="rowgroup" rowSpan={tot.length} className={styles.cliente}>
                      Total
                      <small className={styles.totalCliente}>
                        {nf.format(nTotal)} análisis{todasConPlan.length > filasConLineas.length ? ` · ${nf.format(todasConPlan.length)} clientes` : ''}
                      </small>
                    </th>}
                    <CeldasLinea l={l} entregable={conPlan && entregableTotal(l)} />
                  </tr>
                ))
              })()}
            </tfoot>
          )}
        </table>
        {filasConLineas.length === 0 && <p className={styles.vacio}>Todavía no hay datos con estos filtros.</p>}
      </div>

      {apagados.length > 0 && (
        <button type="button" className={styles.alternar} aria-expanded={verApagados} onClick={() => setVerApagados((v) => !v)}>
          {verApagados ? 'Ocultar' : 'Mostrar'} los {nf.format(apagados.length)} clientes sin análisis
        </button>
      )}
    </section>
  )
}
