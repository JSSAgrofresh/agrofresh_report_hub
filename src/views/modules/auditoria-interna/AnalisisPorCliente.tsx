import { useEffect, useMemo, useState } from 'react'
import { listarClientes } from '@/features/catalogo'
import { clientesSinAnalisis, porClienteResiduosFsmaFito } from '@/features/auditoriaInterna'
import type { CeldaCliente, DimensionGrafico, SolicitudAuditoria } from '@/features/auditoriaInterna'
import { COLOR_LAB } from './coloresTipo'
import styles from './AnalisisPorCliente.module.css'

const nf = new Intl.NumberFormat('es-CL')

/** El número de análisis pedidos en una pastilla del color del laboratorio; ✓ = cuántos ya tienen informe. */
function Celda({ c, color }: { c: CeldaCliente; color: string }) {
  if (c.n === 0) return <span className={styles.cero}>–</span>
  return (
    <span className={styles.celda} title={`${c.informes} de ${c.n} con informe`}>
      <b className={styles.pastilla} style={{ color, background: `${color}1f` }}>{nf.format(c.n)}</b>
      <small>{c.informes}✓</small>
    </span>
  )
}

/**
 * El cuerpo del gráfico «Análisis por laboratorio · top Sold To»: cada cliente hacia abajo, el que más
 * análisis lleva primero, con el detalle: residuales (AgroFresh y Quiteca), FSMA y FITO, más su total,
 * los entregables y el %. Los clientes del listado que todavía no tienen ningún análisis salen al final,
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
  const nRes = suma((x) => x.agrofresh) + suma((x) => x.quiteca)
  const nFsma = suma((x) => x.fsma)
  const nFito = suma((x) => x.fito)
  const nTotal = filas.reduce((n, x) => n + x.total, 0)
  const nInformes = filas.reduce((n, x) => n + x.informes, 0)

  return (
    <section className={styles.cuerpoGrafico} aria-label="Análisis por cliente">
      <p className={styles.resumen}>
        {nf.format(todas.length)} con análisis{limite > 0 && todas.length > limite ? `, mostrando los ${nf.format(limite)} primeros` : ', de más a menos'}
        {apagados.length > 0 && ` · ${nf.format(apagados.length)} del listado todavía sin ninguno`}
        {' · el número son los análisis pedidos y ✓ cuántos ya tienen informe'}
      </p>

      <div className={styles.caja}>
        <table className={styles.tabla}>
          <thead>
            <tr className={styles.grupos}>
              <th rowSpan={2} className={styles.colCliente}>{dimension === 'cliente' ? 'Cliente' : 'Grupo'}</th>
              <th colSpan={2} className={styles.gResiduales}>Residuales <small>{nf.format(nRes)} análisis</small></th>
              <th className={styles.gFsma}>FSMA <small>{nf.format(nFsma)}</small></th>
              <th className={styles.gFito}>FITO <small>{nf.format(nFito)}</small></th>
              <th rowSpan={2} className={styles.gTotal}>Total</th>
              <th colSpan={2} className={styles.gEntregable}>Entregables</th>
            </tr>
            <tr className={styles.subs}>
              <th style={{ color: COLOR_LAB.AGROFRESH }}>AgroFresh</th>
              <th style={{ color: COLOR_LAB.QUITECA }}>Quiteca</th>
              <th style={{ color: COLOR_LAB.ALS }}>ALS</th>
              <th style={{ color: COLOR_LAB.DIAGNOFRUIT }}>Diagnofruit</th>
              <th className={styles.gEntregable} title="Lo que cada comercial concretó de cada análisis para cada planta (se carga aparte)">Cant.</th>
              <th className={styles.gEntregable}>%</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={f.cliente}>
                <th scope="row" className={styles.cliente}>
                  <em className={i < 3 ? styles.podio : undefined} data-puesto={i < 3 ? i + 1 : undefined}>{i + 1}</em>
                  <span title={f.cliente}>{f.cliente}</span>
                </th>
                <td><Celda c={f.agrofresh} color={COLOR_LAB.AGROFRESH} /></td>
                <td><Celda c={f.quiteca} color={COLOR_LAB.QUITECA} /></td>
                <td><Celda c={f.fsma} color={COLOR_LAB.ALS} /></td>
                <td><Celda c={f.fito} color={COLOR_LAB.DIAGNOFRUIT} /></td>
                <td className={styles.total}><b>{nf.format(f.total)}</b><small>{f.informes}✓</small></td>
                <td className={styles.pendienteDato} title="Se cargará con el plan de entregables de los comerciales">—</td>
                <td className={styles.pendienteDato}>—</td>
              </tr>
            ))}
            {verApagados &&
              apagados.map((nombre) => (
                <tr key={nombre} className={styles.apagado}>
                  <th scope="row" className={styles.cliente}><em>·</em><span title={nombre}>{nombre}</span></th>
                  <td><span className={styles.cero}>–</span></td>
                  <td><span className={styles.cero}>–</span></td>
                  <td><span className={styles.cero}>–</span></td>
                  <td><span className={styles.cero}>–</span></td>
                  <td className={styles.total}><b>0</b></td>
                  <td className={styles.pendienteDato}>—</td>
                  <td className={styles.pendienteDato}>—</td>
                </tr>
              ))}
          </tbody>
          {filas.length > 0 && (
            <tfoot>
              <tr>
                <th scope="row" className={styles.cliente}>Total</th>
                <td><Celda c={{ n: suma((x) => x.agrofresh), informes: filas.reduce((n, x) => n + x.agrofresh.informes, 0) }} color={COLOR_LAB.AGROFRESH} /></td>
                <td><Celda c={{ n: suma((x) => x.quiteca), informes: filas.reduce((n, x) => n + x.quiteca.informes, 0) }} color={COLOR_LAB.QUITECA} /></td>
                <td><Celda c={{ n: nFsma, informes: filas.reduce((n, x) => n + x.fsma.informes, 0) }} color={COLOR_LAB.ALS} /></td>
                <td><Celda c={{ n: nFito, informes: filas.reduce((n, x) => n + x.fito.informes, 0) }} color={COLOR_LAB.DIAGNOFRUIT} /></td>
                <td className={styles.total}><b>{nf.format(nTotal)}</b><small>{nInformes}✓</small></td>
                <td className={styles.pendienteDato}>—</td>
                <td className={styles.pendienteDato}>—</td>
              </tr>
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
