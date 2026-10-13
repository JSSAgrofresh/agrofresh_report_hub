import { useEffect, useMemo, useState } from 'react'
import { listarClientes } from '@/features/catalogo'
import { clientesSinAnalisis, porClienteResiduosFsmaFito } from '@/features/auditoriaInterna'
import type { CeldaCliente, DimensionGrafico, SolicitudAuditoria } from '@/features/auditoriaInterna'
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

/** Cantidad de un laboratorio en una pastilla de su color y, en la columna de al lado, su % del total de residuales. */
function CeldasLab({ c, total, color }: { c: CeldaCliente; total: number; color: string }) {
  if (c.n === 0) return <><td className={`${styles.cero} ${styles.cant}`}>–</td><td className={`${styles.cero} ${styles.pctVacio}`}>–</td></>
  return (
    <>
      <td className={styles.cant} title={`${c.informes} de ${c.n} con informe`}><b className={styles.pastilla} style={{ color, background: `${color}1f` }}>{nf.format(c.n)}</b></td>
      <td className={styles.pct}>{pct(c.n / total)}</td>
    </>
  )
}

/** Las celdas de una línea: análisis, total (con ✓ de informes), reparto por laboratorio (residuales) y entregables. */
function CeldasLinea({ l }: { l: Linea }) {
  return (
    <>
      <th scope="row" className={styles.lineaGrupo} style={{ color: l.color }}>
        {l.nombre}{l.sub && <small>{l.sub}</small>}
      </th>
      <td className={styles.valor} title={`${l.c.informes} de ${l.c.n} con informe`}>
        <b className={styles.cifra}>{nf.format(l.c.n)}</b><small>{l.c.informes}✓</small>
      </td>
      {l.labs ? (
        <>
          <CeldasLab c={l.labs.agf} total={l.c.n} color={COLOR_LAB.AGROFRESH} />
          <CeldasLab c={l.labs.qui} total={l.c.n} color={COLOR_LAB.QUITECA} />
        </>
      ) : (
        <td colSpan={4} className={styles.cero}>{l.sub}</td>
      )}
      <td className={styles.pendienteDato} title="Se cargará con el plan de entregables de los comerciales">—</td>
      <td className={styles.pendienteDato}>—</td>
    </>
  )
}

/**
 * El cuerpo del gráfico «Análisis por laboratorio · top Sold To»: cada cliente hacia abajo, el que más
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
}: {
  solicitudes: SolicitudAuditoria[]
  dimension?: DimensionGrafico
  /** cuántas filas mostrar (0 = todas) */
  limite?: number
}) {
  const todas = useMemo(() => porClienteResiduosFsmaFito(solicitudes, dimension), [solicitudes, dimension])
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
  const apagados = useMemo(() => (dimension === 'cliente' ? clientesSinAnalisis(listado, todas) : []), [listado, todas, dimension])

  const suma = (f: (x: (typeof filas)[number]) => CeldaCliente) => filas.reduce((n, x) => n + f(x).n, 0)
  const nFsma = suma((x) => x.fsma)
  const nFito = suma((x) => x.fito)
  const nTotal = filas.reduce((n, x) => n + x.total, 0)
  const nInformes = filas.reduce((n, x) => n + x.informes, 0)

  return (
    <section className={styles.cuerpoGrafico} aria-label="Análisis por cliente">
      <div className={styles.caja}>
        <table className={styles.tabla}>
          <colgroup>
            <col style={{ width: '23%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '9%' }} />
            <col style={{ width: '9.5%' }} /><col style={{ width: '9.5%' }} />
            <col style={{ width: '9.5%' }} /><col style={{ width: '9.5%' }} />
            <col style={{ width: '9.5%' }} /><col style={{ width: '9.5%' }} />
          </colgroup>
          <thead>
            <tr className={styles.grupos}>
              <th rowSpan={2} className={styles.colCliente}>{dimension === 'cliente' ? 'Cliente' : 'Grupo'}</th>
              <th rowSpan={2} className={styles.colAnalisis}>Análisis</th>
              <th rowSpan={2} className={styles.gTotal}>Total</th>
              <th colSpan={2} className={styles.gResiduales}>AgroFresh</th>
              <th colSpan={2} className={styles.gQuiteca}>Quiteca</th>
              <th colSpan={2} className={styles.gEntregable}>Entregables</th>
            </tr>
            <tr className={styles.subs}>
              <th>Cant.</th><th>%</th>
              <th>Cant.</th><th>%</th>
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
                        <small className={styles.totalCliente}>{nf.format(f.total)} análisis · {f.informes}✓</small>
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
                  <td colSpan={8}><span className={styles.cero}>Sin análisis</span></td>
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
                    {j === 0 && <th scope="rowgroup" rowSpan={tot.length} className={styles.cliente}>Total<small className={styles.totalCliente}>{nf.format(nTotal)} análisis · {nInformes}✓</small></th>}
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
