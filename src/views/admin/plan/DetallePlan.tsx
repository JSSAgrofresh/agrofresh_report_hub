import { useEffect, useMemo, useState } from 'react'
import { BotonExcel } from '@/components/ui/BotonExcel'
import {
  FILTROS_DETALLE_VACIOS,
  NOMBRE_SERVICIO,
  filtrarDetalle,
  leerDetallePlanEntregables,
  totalesDetalle,
  valoresDe,
} from '@/features/planEntregables'
import type { FiltrosDetallePlan, RespuestaDetallePlan } from '@/features/planEntregables'
import { fechaHora } from '@/lib/fechaHoraChile'
import styles from './DetallePlan.module.css'

const nf = new Intl.NumberFormat('es-CL')
const POR_PAGINA = 100
const guion = <span className={styles.vacio}>—</span>

/**
 * Administración General → Plan de entregables → «Todo lo cargado».
 *
 * La tabla literal del plan guardado: UNA fila por Sold To × planta × servicio × línea × semana, con el código SAP, el comercial,
 * el tipo de cliente y las dos cantidades (Original y Propuesta), sin agrupar ni esconder nada. Sirve para comprobar que el
 * sistema leyó bien el Excel: se filtra, se ven los totales de lo que queda a la vista y se baja a Excel (todas las filas filtradas).
 */
export function DetallePlan({ recargar }: { recargar: unknown }) {
  const [datos, setDatos] = useState<RespuestaDetallePlan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filtros, setFiltros] = useState<FiltrosDetallePlan>(FILTROS_DETALLE_VACIOS)
  const [pagina, setPagina] = useState(0)

  useEffect(() => {
    let cancelado = false
    leerDetallePlanEntregables()
      .then((d) => {
        if (cancelado) return
        setDatos(d)
        setError(null)
      })
      .catch(() => {
        if (!cancelado) setError('No se pudo leer el detalle del plan.')
      })
    return () => {
      cancelado = true
    }
  }, [recargar])

  const filas = useMemo(() => datos?.filas ?? [], [datos])
  const visibles = useMemo(() => filtrarDetalle(filas, filtros), [filas, filtros])
  const totales = useMemo(() => totalesDetalle(visibles), [visibles])
  const paginas = Math.max(1, Math.ceil(visibles.length / POR_PAGINA))
  const actual = Math.min(pagina, paginas - 1)
  const pagVisible = visibles.slice(actual * POR_PAGINA, (actual + 1) * POR_PAGINA)

  const cambiar = (parcial: Partial<FiltrosDetallePlan>) => {
    setFiltros((f) => ({ ...f, ...parcial }))
    setPagina(0)
  }

  const filasExcel = useMemo(
    () => [
      ['Comercial', 'Sold To', 'Código SAP', 'Planta', 'Tipo de cliente', 'Tipo de servicio', 'Servicio', 'Línea', 'Semana', 'Peak', 'Original', 'Propuesta'],
      ...visibles.map((x) => [
        x.comercial, x.sold_to, x.sold_to_sap, x.planta_plan, x.tipo_cliente, x.tipo_servicio, NOMBRE_SERVICIO[x.servicio] ?? x.servicio,
        x.linea, x.semana, x.peak, x.original, x.propuesta,
      ]),
      ['Total', null, null, null, null, null, null, null, null, null, totales.original, totales.propuesta],
    ],
    [visibles, totales],
  )

  const hayFiltros = Object.values(filtros).some(Boolean)

  return (
    <section className={styles.tarjeta} aria-label="Todo lo cargado del plan de entregables">
      <div className={styles.cabecera}>
        <h2 className={styles.titulo}>Todo lo cargado</h2>
        {datos && datos.filas.length > 0 && (
          <BotonExcel archivo="plan-de-entregables" filas={filasExcel} disabled={visibles.length === 0} etiqueta="Excel de lo que se ve" />
        )}
      </div>
      <p className={styles.texto}>
        La tabla tal como quedó guardada, una fila por Sold To, planta, servicio, línea y semana, con las dos cantidades. Úsala para
        comprobar que el sistema leyó bien el Excel{datos?.cargado_en ? ` (cargado el ${fechaHora(datos.cargado_en)})` : ''}.
      </p>

      {error && <p className={styles.error} role="alert">{error}</p>}
      {datos?.migracion_pendiente && <p className={styles.aviso} role="status">Falta correr la migración 0062 en el servidor.</p>}
      {datos && !datos.migracion_pendiente && !datos.detalle_completo && (
        <p className={styles.aviso} role="status">
          Falta correr la migración 0073 en el servidor: por ahora solo se ve el Sold To, la planta, el servicio y una cantidad. Corre la migración
          y vuelve a cargar el Excel para ver el detalle completo.
        </p>
      )}
      {datos && !datos.migracion_pendiente && datos.filas.length === 0 && <p className={styles.texto}>Todavía no hay un plan cargado.</p>}

      {datos && datos.filas.length > 0 && (
        <>
          <ul className={styles.cifras} aria-label="Totales de lo que se ve">
            <li><b>{nf.format(totales.filas)}</b><span>filas{hayFiltros ? ` de ${nf.format(filas.length)}` : ''}</span></li>
            <li><b>{nf.format(totales.soldTo)}</b><span>Sold To</span></li>
            <li><b>{nf.format(totales.plantas)}</b><span>plantas</span></li>
            <li><b>{nf.format(totales.original)}</b><span>Original (total)</span></li>
            <li><b>{nf.format(totales.propuesta)}</b><span>Propuesta (total)</span></li>
            {Object.entries(totales.porServicio).map(([k, v]) => (
              <li key={k}><b>{nf.format(v.original)} / {nf.format(v.propuesta)}</b><span>{NOMBRE_SERVICIO[k] ?? k} (orig. / prop.)</span></li>
            ))}
          </ul>

          <div className={styles.filtros}>
            <label>
              Buscar
              <input type="search" placeholder="Sold To, código SAP, planta…" value={filtros.texto} onChange={(e) => cambiar({ texto: e.target.value })} />
            </label>
            <label>
              Comercial
              <select value={filtros.comercial} onChange={(e) => cambiar({ comercial: e.target.value })}>
                <option value="">Todos</option>
                {valoresDe(filas, 'comercial').map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            <label>
              Servicio
              <select value={filtros.servicio} onChange={(e) => cambiar({ servicio: e.target.value })}>
                <option value="">Todos</option>
                {Object.entries(NOMBRE_SERVICIO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label>
              Tipo de cliente
              <select value={filtros.tipoCliente} onChange={(e) => cambiar({ tipoCliente: e.target.value })}>
                <option value="">Todos</option>
                {valoresDe(filas, 'tipo_cliente').map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            <label>
              Semana
              <select value={filtros.semana} onChange={(e) => cambiar({ semana: e.target.value })}>
                <option value="">Todas</option>
                {valoresDe(filas, 'semana').map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            {hayFiltros && <button type="button" className={styles.limpiar} onClick={() => { setFiltros(FILTROS_DETALLE_VACIOS); setPagina(0) }}>Limpiar filtros</button>}
          </div>

          <div className={styles.caja}>
            <table className={styles.tabla}>
              <thead>
                <tr>
                  <th>Comercial</th><th>Sold To</th><th>Código SAP</th><th>Planta</th><th>Tipo de cliente</th><th>Tipo de servicio</th>
                  <th>Servicio</th><th className={styles.num}>Línea</th><th>Semana</th><th>Peak</th>
                  <th className={styles.num}>Original</th><th className={styles.num}>Propuesta</th>
                </tr>
              </thead>
              <tbody>
                {pagVisible.map((x, i) => (
                  <tr key={`${actual}-${i}`}>
                    <td>{x.comercial ?? guion}</td>
                    <td>{x.sold_to}</td>
                    <td>{x.sold_to_sap ?? guion}</td>
                    <td>{x.planta_plan ?? guion}</td>
                    <td>{x.tipo_cliente ?? guion}</td>
                    <td>{x.tipo_servicio ?? guion}</td>
                    <td>{NOMBRE_SERVICIO[x.servicio] ?? x.servicio}</td>
                    <td className={styles.num}>{x.linea ?? guion}</td>
                    <td>{x.semana ?? guion}</td>
                    <td>{x.peak ?? guion}</td>
                    <td className={styles.num}>{x.original === null ? guion : nf.format(x.original)}</td>
                    <td className={styles.num}>{x.propuesta === null ? guion : nf.format(x.propuesta)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visibles.length === 0 && <p className={styles.texto} style={{ padding: 'var(--space-4)' }}>Ninguna fila cumple los filtros.</p>}
          </div>

          <div className={styles.pie}>
            <span>
              {visibles.length === 0 ? '0 filas' : `Filas ${nf.format(actual * POR_PAGINA + 1)} a ${nf.format(actual * POR_PAGINA + pagVisible.length)} de ${nf.format(visibles.length)}`}
              {' · un guion es un dato vacío en el Excel'}
            </span>
            <span className={styles.paginas}>
              <button type="button" disabled={actual === 0} onClick={() => setPagina(actual - 1)}>Anterior</button>
              Página {nf.format(actual + 1)} de {nf.format(paginas)}
              <button type="button" disabled={actual >= paginas - 1} onClick={() => setPagina(actual + 1)}>Siguiente</button>
            </span>
          </div>
        </>
      )}
    </section>
  )
}
