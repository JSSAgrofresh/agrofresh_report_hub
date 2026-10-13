import { useEffect, useMemo, useState } from 'react'
import { listarClientes } from '@/features/catalogo'
import { ANALISIS_VISIBLES, clientesSinAnalisis, porClienteResiduosFsmaFito, soloAnalisis } from '@/features/auditoriaInterna'
import type { AnalisisVisible, CeldaCliente, DimensionGrafico, SolicitudAuditoria } from '@/features/auditoriaInterna'
import { COLOR_LAB } from './coloresTipo'
import styles from './AnalisisPorCliente.module.css'

const nf = new Intl.NumberFormat('es-CL')

type Linea = { clave: string; nombre: string; sub?: string; c: CeldaCliente; color: string; labs?: { agf: CeldaCliente; qui: CeldaCliente } }
type Cuatro = { agrofresh: CeldaCliente; quiteca: CeldaCliente; fsma: CeldaCliente; fito: CeldaCliente }

/** Las líneas de un cliente (o del total): Residuales (con su reparto entre AgroFresh y Quiteca), FSMA y FITO. Solo lo que tiene análisis. */
function lineasDe(x: Cuatro): Linea[] {
  const res: CeldaCliente = { n: x.agrofresh.n + x.quiteca.n, informes: x.agrofresh.informes + x.quiteca.informes }
  const out: Linea[] = []
  if (res.n > 0) out.push({ clave: 'res', nombre: 'Residuales', c: res, color: '#4d7c0f', labs: { agf: x.agrofresh, qui: x.quiteca } })
  if (x.fsma.n > 0) out.push({ clave: 'fsma', nombre: 'FSMA', sub: 'ALS', c: x.fsma, color: COLOR_LAB.ALS })
  if (x.fito.n > 0) out.push({ clave: 'fito', nombre: 'FITO', sub: 'Diagnofruit', c: x.fito, color: COLOR_LAB.DIAGNOFRUIT })
  return out
}

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

/** Las celdas de una línea: análisis, reparto por laboratorio (residuales, en la misma línea), total y entregables. */
function CeldasLinea({ l }: { l: Linea }) {
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
      <td className={styles.pendienteDato} title="Se cargará con el plan de entregables de los comerciales">—</td>
      <td className={styles.pendienteDato}>—</td>
    </>
  )
}

/**
 * El cuerpo del gráfico «Análisis por cliente»: cada cliente hacia abajo, el que más
 * análisis lleva primero, con el detalle: una fila por análisis (Residuales con su reparto por laboratorio en columnas, cantidad y % del total de residuales, FSMA y FITO),
 * con su total, los entregables y el %. Los clientes del listado que todavía no tienen ningún análisis salen al final,
 * apagados (solo cuando se agrupa por Sold To).
 * «Entregables» = lo que cada comercial concretó de cada análisis para cada planta: ese dato
 * se carga aparte (plan de entregables), por ahora queda en blanco.
 */
export function AnalisisPorCliente({
  solicitudes,
  dimension = 'cliente',
  limite = 0,
  analisis = ANALISIS_VISIBLES,
}: {
  solicitudes: SolicitudAuditoria[]
  dimension?: DimensionGrafico
  /** cuántas filas mostrar (0 = todas) */
  limite?: number
  /** qué análisis se ven (por defecto los tres); el total y el orden de cada cliente cuentan solo lo visible */
  analisis?: AnalisisVisible[]
}) {
  // Sin filtrar por análisis: sirve para saber qué clientes del listado no tienen NINGÚN análisis.
  const crudas = useMemo(() => porClienteResiduosFsmaFito(solicitudes, dimension), [solicitudes, dimension])
  const todas = useMemo(() => soloAnalisis(crudas, analisis), [crudas, analisis])
  const filas = useMemo(() => (limite > 0 ? todas.slice(0, limite) : todas), [todas, limite])
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
  const apagados = useMemo(() => (dimension === 'cliente' ? clientesSinAnalisis(listado, crudas) : []), [listado, crudas, dimension])

  const suma = (f: (x: (typeof filas)[number]) => CeldaCliente) => filas.reduce((n, x) => n + f(x).n, 0)
  const nFsma = suma((x) => x.fsma)
  const nFito = suma((x) => x.fito)
  const nTotal = filas.reduce((n, x) => n + x.total, 0)

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
            <col style={{ width: '8%' }} /><col style={{ width: '8%' }} />
          </colgroup>
          <thead>
            <tr className={styles.grupos}>
              <th rowSpan={2} className={styles.colCliente}>{dimension === 'cliente' ? 'Cliente' : 'Grupo'}</th>
              <th rowSpan={2} className={styles.colAnalisis}>Análisis</th>
              <th colSpan={6} className={styles.gResiduales}>Laboratorio · cantidad y % del total de residuales</th>
              <th rowSpan={2} className={styles.gTotal}>Total</th>
              <th colSpan={2} className={styles.gEntregable}>Entregables</th>
            </tr>
            <tr className={styles.subs}>
              <th>Lab.</th><th>Cant.</th><th>%</th>
              <th>Lab.</th><th>Cant.</th><th>%</th>
              <th className={styles.gEntregable} title="Lo que cada comercial concretó de cada análisis para cada planta (se carga aparte)">Cant.</th>
              <th className={styles.gEntregable}>%</th>
            </tr>
          </thead>
          {filas.map((f, i) => {
            const ls = lineasDe(f)
            return (
              <tbody key={f.cliente} className={styles.bloque}>
                {ls.map((l, j) => (
                  <tr key={l.clave} className={styles.filaGrupo}>
                    {j === 0 && (
                      <th scope="rowgroup" rowSpan={ls.length} className={styles.cliente}>
                        <em className={i < 3 ? styles.podio : undefined} data-puesto={i < 3 ? i + 1 : undefined}>{i + 1}</em>
                        <span title={f.cliente}>{f.cliente}</span>
                        <small className={styles.totalCliente}>{nf.format(f.total)} análisis</small>
                      </th>
                    )}
                    <CeldasLinea l={l} />
                  </tr>
                ))}
              </tbody>
            )
          })}
          {verApagados && (
            <tbody>
              {apagados.map((nombre) => (
                <tr key={nombre} className={styles.apagado}>
                  <th scope="row" className={styles.cliente}><em>·</em><span title={nombre}>{nombre}</span></th>
                  <td colSpan={10}><span className={styles.cero}>Sin análisis</span></td>
                </tr>
              ))}
            </tbody>
          )}
          {filas.length > 0 && (
            <tfoot>
              {(() => {
                const tot = lineasDe({
                  agrofresh: { n: suma((x) => x.agrofresh), informes: filas.reduce((n, x) => n + x.agrofresh.informes, 0) },
                  quiteca: { n: suma((x) => x.quiteca), informes: filas.reduce((n, x) => n + x.quiteca.informes, 0) },
                  fsma: { n: nFsma, informes: filas.reduce((n, x) => n + x.fsma.informes, 0) },
                  fito: { n: nFito, informes: filas.reduce((n, x) => n + x.fito.informes, 0) },
                })
                return tot.map((l, j) => (
                  <tr key={l.clave} className={styles.filaGrupo}>
                    {j === 0 && <th scope="rowgroup" rowSpan={tot.length} className={styles.cliente}>Total<small className={styles.totalCliente}>{nf.format(nTotal)} análisis</small></th>}
                    <CeldasLinea l={l} />
                  </tr>
                ))
              })()}
            </tfoot>
          )}
        </table>
        {filas.length === 0 && <p className={styles.vacio}>Todavía no hay datos con estos filtros.</p>}
      </div>

      {apagados.length > 0 && (
        <button type="button" className={styles.alternar} aria-expanded={verApagados} onClick={() => setVerApagados((v) => !v)}>
          {verApagados ? 'Ocultar' : 'Mostrar'} los {nf.format(apagados.length)} clientes sin análisis
        </button>
      )}
    </section>
  )
}
