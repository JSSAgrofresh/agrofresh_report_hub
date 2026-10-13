import { useEffect, useMemo, useState } from 'react'
import { listarClientes } from '@/features/catalogo'
import { clientesSinAnalisis, porClienteResiduosFsmaFito } from '@/features/auditoriaInterna'
import type { CeldaCliente, DimensionGrafico, SolicitudAuditoria } from '@/features/auditoriaInterna'
import { COLOR_LAB } from './coloresTipo'
import styles from './AnalisisPorCliente.module.css'

const nf = new Intl.NumberFormat('es-CL')

function Celda({ c, color }: { c: CeldaCliente; color: string }) {
  if (c.n === 0) return <span className={styles.cero}>–</span>
  return (
    <span className={styles.numero} title={`${c.informes} de ${c.n} con informe`}>
      <b style={{ color }}>{nf.format(c.n)}</b>
      <small>{c.informes} con informe</small>
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

  return (
    <section className={styles.cuerpoGrafico} aria-label="Análisis por cliente">
      <p className={styles.resumen}>
        {nf.format(todas.length)} con análisis{limite > 0 && todas.length > limite ? `, mostrando los ${nf.format(limite)} primeros` : ', de más a menos'}
        {apagados.length > 0 && ` · ${nf.format(apagados.length)} del listado todavía sin ninguno`}
      </p>

      <div className={styles.tabla} role="table" aria-label="Análisis por cliente">
        <div className={`${styles.fila} ${styles.cabecera}`} role="row">
          <span role="columnheader">Cliente</span>
          <span className={styles.grupo} role="columnheader">
            Residuales
            <span className={styles.sub}>
              <i style={{ color: COLOR_LAB.AGROFRESH }}>AgroFresh</i>
              <i style={{ color: COLOR_LAB.QUITECA }}>Quiteca</i>
            </span>
          </span>
          <span role="columnheader" style={{ color: COLOR_LAB.ALS }}>FSMA</span>
          <span role="columnheader" style={{ color: COLOR_LAB.DIAGNOFRUIT }}>FITO</span>
          <span role="columnheader">Total</span>
          <span role="columnheader" title="Lo que cada comercial concretó de cada análisis para cada planta (se carga aparte)">Entregables</span>
          <span role="columnheader">%</span>
        </div>

        {filas.map((f, i) => (
          <div key={f.cliente} className={styles.fila} role="row">
            <span className={styles.cliente} role="cell">
              <em>{i + 1}</em>
              <b title={f.cliente}>{f.cliente}</b>
            </span>
            <span className={styles.residuales} role="cell">
              <Celda c={f.agrofresh} color={COLOR_LAB.AGROFRESH} />
              <Celda c={f.quiteca} color={COLOR_LAB.QUITECA} />
            </span>
            <span role="cell"><Celda c={f.fsma} color={COLOR_LAB.ALS} /></span>
            <span role="cell"><Celda c={f.fito} color={COLOR_LAB.DIAGNOFRUIT} /></span>
            <span className={styles.total} role="cell">
              <b>{nf.format(f.total)}</b>
              <small>{f.informes} con informe</small>
            </span>
            <span className={styles.pendienteDato} role="cell" title="Se cargará con el plan de entregables de los comerciales">—</span>
            <span className={styles.pendienteDato} role="cell">—</span>
          </div>
        ))}

        {filas.length === 0 && <p className={styles.vacio}>Todavía no hay clientes con análisis con estos filtros.</p>}

        {apagados.length > 0 && (
          <>
            <button type="button" className={styles.alternar} aria-expanded={verApagados} onClick={() => setVerApagados((v) => !v)}>
              {verApagados ? 'Ocultar' : 'Mostrar'} los {nf.format(apagados.length)} clientes sin análisis
            </button>
            {verApagados &&
              apagados.map((nombre) => (
                <div key={nombre} className={`${styles.fila} ${styles.apagado}`} role="row">
                  <span className={styles.cliente} role="cell"><em>·</em><b title={nombre}>{nombre}</b></span>
                  <span className={styles.residuales} role="cell"><span className={styles.cero}>–</span><span className={styles.cero}>–</span></span>
                  <span role="cell"><span className={styles.cero}>–</span></span>
                  <span role="cell"><span className={styles.cero}>–</span></span>
                  <span className={styles.total} role="cell"><b>0</b></span>
                  <span className={styles.pendienteDato} role="cell">—</span>
                  <span className={styles.pendienteDato} role="cell">—</span>
                </div>
              ))}
          </>
        )}
      </div>
    </section>
  )
}
