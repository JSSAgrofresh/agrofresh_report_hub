import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Skeleton } from '@/components/ui/Skeleton'
import {
  BLOQUES,
  agruparPorPlanta,
  agruparPorSemana,
  buscarCliente,
  conRiesgo,
  filtrarPorFecha,
  fmtPct,
  informesDe,
  leerRendimientoCalidad,
  numeroSemana,
  pctNoCumple,
  porcentajeGeneral,
  rangoPorDefecto,
  rangoSemana,
  sumarBloques,
  sumarDias,
} from '@/features/rendimientoCalidad'
import type { Bloques, CeldaBloque, Conteo, RespuestaRendimiento } from '@/features/rendimientoCalidad'
import { AuditoriaHero } from './AuditoriaHero'
import { DetallePlantaModal } from './DetallePlantaModal'
import styles from './RendimientoCalidadView.module.css'

type Vista = 'cliente' | 'semana'

/** Los números de un servicio (Línea de proceso o Actimist): cumple y no cumple. */
function Par({ c }: { c: Conteo }) {
  if (informesDe(c) === 0) return <><td className={`${styles.n} ${styles.cero}`}>—</td><td className={`${styles.n} ${styles.cero}`}>—</td></>
  return (
    <>
      <td className={styles.n}>{c.cumple}</td>
      <td className={`${styles.n} ${c.noCumple ? styles.mal : styles.cero}`}>{c.noCumple}</td>
    </>
  )
}

/** El total de un análisis: informes, cumple, no cumple y % no cumple. */
function Total({ c }: { c: Conteo }) {
  const p = pctNoCumple(c)
  if (p === null) return <>{[0, 1, 2, 3].map((i) => <td key={i} className={`${styles.n} ${styles.total} ${styles.cero}`}>—</td>)}</>
  return (
    <>
      <td className={`${styles.n} ${styles.total}`}>{informesDe(c)}</td>
      <td className={`${styles.n} ${styles.total}`}>{c.cumple}</td>
      <td className={`${styles.n} ${styles.total} ${c.noCumple ? styles.mal : styles.cero}`}>{c.noCumple}</td>
      <td className={`${styles.n} ${styles.total} ${styles.pct} ${conRiesgo(p) ? styles.mal : ''}`}>{fmtPct(p)}</td>
    </>
  )
}

function Celdas({ b, general }: { b: Bloques; general: number | null }) {
  return (
    <>
      {BLOQUES.map(({ id }) => {
        const c: CeldaBloque = b[id]
        return (
          <Fragment key={id}>
            {id === 'residuales' && (
              <>
                <Par c={c.linea} />
                <Par c={c.actimist} />
                <Par c={c.ecofog} />
              </>
            )}
            <Total c={c.total} />
          </Fragment>
        )
      })}
      <td className={`${styles.n} ${styles.general} ${conRiesgo(general) ? styles.mal : ''}`}>{fmtPct(general)}</td>
    </>
  )
}

function Encabezado({ primera, ancho }: { primera: string; ancho: number }) {
  return (
    <thead>
      <tr>
        <th rowSpan={3} className={`${styles.izq} ${styles.fija}`} style={{ minWidth: ancho }}>{primera}</th>
        {BLOQUES.map((b) => (
          <th key={b.id} colSpan={b.id === 'residuales' ? 10 : 4} className={`${styles.grupo} ${styles.sep}`}>{b.titulo}</th>
        ))}
        <th rowSpan={3} className={`${styles.grupo} ${styles.sep}`}>General<br />% No cumple</th>
      </tr>
      <tr>
        {BLOQUES.map((b) => (
          <Fragment key={b.id}>
            {b.id === 'residuales' && (
              <>
                <th colSpan={2} className={`${styles.sub} ${styles.sep}`}>Línea de proceso</th>
                <th colSpan={2} className={`${styles.sub} ${styles.sep}`}>Actimist</th>
                <th colSpan={2} className={`${styles.sub} ${styles.sep}`}>Ecofog</th>
              </>
            )}
            <th colSpan={4} className={`${styles.sub} ${styles.sep}`}>Total</th>
          </Fragment>
        ))}
      </tr>
      <tr>
        {BLOQUES.map((b) => (
          <Fragment key={b.id}>
            {b.id === 'residuales' && (
              <>
                <th className={styles.sep}>Cumple</th><th>No cumple</th>
                <th className={styles.sep}>Cumple</th><th>No cumple</th>
                <th className={styles.sep}>Cumple</th><th>No cumple</th>
              </>
            )}
            <th className={styles.sep}>Informes</th><th>Cumple</th><th>No cumple</th><th>% No cumple</th>
          </Fragment>
        ))}
      </tr>
    </thead>
  )
}

/** Baja lo que se ve en pantalla como Excel (una columna por dato, con el análisis y el servicio en el encabezado). */
async function descargarExcel(primera: string[], filas: { etiqueta: string[]; b: Bloques; general: number | null }[], nombre: string) {
  const XLSX = await import('xlsx')
  const cab = [...primera]
  for (const { id, titulo } of BLOQUES) {
    const partes = ['Total · Informes', 'Total · Cumple', 'Total · No cumple', 'Total · % No cumple']
    if (id === 'residuales') partes.unshift('Línea de proceso · Cumple', 'Línea de proceso · No cumple', 'Actimist · Cumple', 'Actimist · No cumple', 'Ecofog · Cumple', 'Ecofog · No cumple')
    for (const parte of partes) cab.push(`${titulo} · ${parte}`)
  }
  cab.push('General % No cumple')
  const datos = filas.map((f) => {
    const fila: (string | number)[] = [...f.etiqueta]
    for (const { id } of BLOQUES) {
      const c = f.b[id]
      const p = pctNoCumple(c.total)
      if (id === 'residuales') fila.push(c.linea.cumple, c.linea.noCumple, c.actimist.cumple, c.actimist.noCumple, c.ecofog.cumple, c.ecofog.noCumple)
      fila.push(informesDe(c.total), c.total.cumple, c.total.noCumple, p === null ? '' : Math.round(p * 10) / 10)
    }
    fila.push(f.general === null ? '' : Math.round(f.general * 10) / 10)
    return fila
  })
  const hoja = XLSX.utils.aoa_to_sheet([cab, ...datos])
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja, 'Rendimiento de calidad')
  XLSX.writeFile(libro, nombre)
}

/**
 * Rendimiento de calidad: cuántos informes cumplen y cuántos no, por cliente, planta y semana, para residuales, FSMA y
 * FITO. Dos vistas de lo mismo: «Por cliente» (una fila por planta, para ver quién va con riesgo) y «Por semana» (un
 * cliente y planta semana a semana).
 */
export function RendimientoCalidadView() {
  const [datos, setDatos] = useState<RespuestaRendimiento | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [vista, setVista] = useState<Vista>('cliente')
  const [texto, setTexto] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [soloRiesgo, setSoloRiesgo] = useState(false)
  const [soldTo, setSoldTo] = useState('')
  const [shipTo, setShipTo] = useState('')
  const [abierta, setAbierta] = useState<{ soldTo: string; shipTo: string; desde: string; hasta: string } | null>(null)

  useEffect(() => {
    let cancelado = false
    leerRendimientoCalidad()
      .then((r) => {
        if (cancelado) return
        setDatos(r)
        const rango = rangoPorDefecto(r.filas)
        setDesde(rango.desde)
        setHasta(rango.hasta)
      })
      .catch((e: unknown) => {
        if (!cancelado) setError(e instanceof Error ? e.message : 'No se pudo cargar el rendimiento de calidad.')
      })
    return () => {
      cancelado = true
    }
  }, [])

  const enFecha = useMemo(() => filtrarPorFecha(datos?.filas ?? [], desde, hasta), [datos, desde, hasta])

  const clientes = useMemo(() => [...new Set(enFecha.map((f) => f.sold_to))].sort((a, b) => a.localeCompare(b, 'es')), [enFecha])
  const plantas = useMemo(
    () => [...new Set(enFecha.filter((f) => !soldTo || f.sold_to === soldTo).map((f) => f.ship_to))].sort((a, b) => a.localeCompare(b, 'es')),
    [enFecha, soldTo],
  )

  const plantasFilas = useMemo(() => {
    const lista = agruparPorPlanta(buscarCliente(enFecha, texto))
    return soloRiesgo ? lista.filter((p) => conRiesgo(p.general)) : lista
  }, [enFecha, texto, soloRiesgo])
  const totalPlantas = useMemo(() => sumarBloques(plantasFilas.map((p) => p.bloques)), [plantasFilas])

  const semanasFilas = useMemo(
    () => agruparPorSemana(enFecha.filter((f) => (!soldTo || f.sold_to === soldTo) && (!shipTo || f.ship_to === shipTo))),
    [enFecha, soldTo, shipTo],
  )
  const totalSemanas = useMemo(() => sumarBloques(semanasFilas.map((s) => s.bloques)), [semanasFilas])

  const cerrarDetalle = useCallback(() => setAbierta(null), [])

  function cambiarCliente(valor: string) {
    setSoldTo(valor)
    setShipTo('')
  }

  const sinCriterio = datos ? datos.sin_criterio.residuales + datos.sin_criterio.fsma + datos.sin_criterio.fito : 0

  async function bajar() {
    if (vista === 'cliente')
      await descargarExcel(['Sold To', 'Ship To'], plantasFilas.map((p) => ({ etiqueta: [p.soldTo, p.shipTo], b: p.bloques, general: p.general })), 'rendimiento-calidad-por-cliente.xlsx')
    else
      await descargarExcel(['Semana', 'Desde'], semanasFilas.map((s) => ({ etiqueta: [`Sem ${numeroSemana(s.semana)}`, s.semana], b: s.bloques, general: s.general })), 'rendimiento-calidad-por-semana.xlsx')
  }

  return (
    <div className={styles.pagina}>
      <AuditoriaHero
        etiqueta="Panel de control interno"
        titulo="Rendimiento de calidad"
        descripcion="Cuántos informes cumplen y cuántos no, por cliente, planta y semana, en residuales, FSMA y fitopatología."
      />

      {error && <p role="alert" className={styles.error}>{error}</p>}

      {datos === null && !error ? (
        <Skeleton style={{ height: 260 }} />
      ) : datos && (
        <>
          <div className={styles.barra}>
            <div className={styles.vistas} role="group" aria-label="Vista">
              <button type="button" aria-pressed={vista === 'cliente'} onClick={() => setVista('cliente')}>Por cliente</button>
              <button type="button" aria-pressed={vista === 'semana'} onClick={() => setVista('semana')}>Por semana</button>
            </div>

            {vista === 'cliente' ? (
              <input
                type="search"
                className={styles.buscador}
                placeholder="Buscar Sold To o Ship To…"
                aria-label="Buscar Sold To o Ship To"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
              />
            ) : (
              <>
                <label className={styles.campo}>
                  Cliente
                  <select value={soldTo} onChange={(e) => cambiarCliente(e.target.value)}>
                    <option value="">Todos</option>
                    {clientes.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label className={styles.campo}>
                  Planta
                  <select value={shipTo} onChange={(e) => setShipTo(e.target.value)}>
                    <option value="">Todas</option>
                    {plantas.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </label>
              </>
            )}

            <label className={styles.campo}>
              Desde
              <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </label>
            <label className={styles.campo}>
              Hasta
              <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </label>

            {vista === 'cliente' && (
              <label className={styles.check}>
                <input type="checkbox" checked={soloRiesgo} onChange={(e) => setSoloRiesgo(e.target.checked)} />
                Solo con riesgo
              </label>
            )}
            <button type="button" className={styles.excel} onClick={() => void bajar()}>Descargar Excel</button>
          </div>

          <div className={styles.tablaWrap}>
            <table className={styles.tabla}>
              {vista === 'cliente' ? (
                <>
                  <Encabezado primera="Ship To · Sold To" ancho={240} />
                  <tbody>
                    {plantasFilas.length === 0 ? (
                      <tr><td colSpan={20} className={styles.vacio}>{datos.filas.length === 0 ? 'Todavía no hay informes que juzgar.' : 'Ningún cliente coincide con lo que buscas en este período.'}</td></tr>
                    ) : (
                      plantasFilas.map((p) => (
                        <tr
                          key={`${p.soldTo}|${p.shipTo}`}
                          className={styles.clicable}
                          onClick={() => setAbierta({ soldTo: p.soldTo, shipTo: p.shipTo, desde, hasta })}
                        >
                          <th scope="row" className={`${styles.izq} ${styles.fija} ${styles.cliente}`}>
                            <button type="button" className={styles.abrir} aria-label={`Ver el detalle de ${p.shipTo}`}>
                              <b>{p.shipTo || '—'}</b>
                              <span>{p.soldTo || '—'}</span>
                            </button>
                          </th>
                          <Celdas b={p.bloques} general={p.general} />
                        </tr>
                      ))
                    )}
                  </tbody>
                  {plantasFilas.length > 0 && (
                    <tfoot>
                      <tr>
                        <th scope="row" className={`${styles.izq} ${styles.fija}`}>Total</th>
                        <Celdas b={totalPlantas} general={porcentajeGeneral(totalPlantas)} />
                      </tr>
                    </tfoot>
                  )}
                </>
              ) : (
                <>
                  <Encabezado primera="Semana" ancho={150} />
                  <tbody>
                    {semanasFilas.length === 0 ? (
                      <tr><td colSpan={20} className={styles.vacio}>No hay informes de esa selección en este período.</td></tr>
                    ) : (
                      semanasFilas.map((s) => (
                        <tr
                          key={s.semana}
                          className={shipTo && soldTo ? styles.clicable : undefined}
                          onClick={shipTo && soldTo ? () => setAbierta({ soldTo, shipTo, desde: s.semana, hasta: sumarDias(s.semana, 6) }) : undefined}
                        >
                          <th scope="row" className={`${styles.izq} ${styles.fija} ${styles.cliente}`}>
                            {shipTo && soldTo ? (
                              <button type="button" className={styles.abrir} aria-label={`Ver el detalle de la semana ${numeroSemana(s.semana)}`}>
                                <b>Sem {numeroSemana(s.semana)}</b>
                                <span>{rangoSemana(s.semana)}</span>
                              </button>
                            ) : (
                              <>
                                <b>Sem {numeroSemana(s.semana)}</b>
                                <span>{rangoSemana(s.semana)}</span>
                              </>
                            )}
                          </th>
                          <Celdas b={s.bloques} general={s.general} />
                        </tr>
                      ))
                    )}
                  </tbody>
                  {semanasFilas.length > 0 && (
                    <tfoot>
                      <tr>
                        <th scope="row" className={`${styles.izq} ${styles.fija}`}>Total del período</th>
                        <Celdas b={totalSemanas} general={porcentajeGeneral(totalSemanas)} />
                      </tr>
                    </tfoot>
                  )}
                </>
              )}
            </table>
          </div>

          {abierta && <DetallePlantaModal {...abierta} onCerrar={cerrarDetalle} />}

          <details className={styles.como}>
            <summary>Cómo se juzga cada informe</summary>
            <ul>
              <li><b>Residuales:</b> no cumple si algún analito queda sobre su máximo o bajo su mínimo (tabla por especie; Línea de proceso y Actimist tienen cada una la suya, y Ecofog usa la de Actimist). Es el único análisis que se desglosa por servicio.</li>
              <li><b>FSMA:</b> no cumple si detectó algo. «&lt;1» y ND cuentan como no detectado.</li>
              <li><b>FITO:</b> cumple solo si Botrytis, Alternaria, Geotrichum y Penicillium están en nivel Óptimo{datos.moderado_cumple ? ' o Moderado' : ' (Moderado y Peligroso no cumplen)'}.</li>
              <li><b>General:</b> promedio del % No cumple de los análisis que tuvieron informes; cada análisis pesa lo mismo. Se marca en rojo desde 40 %.</li>
              <li>La semana es la de la fecha de muestreo. El total de Residuales suma Línea de proceso, Actimist y Ecofog.</li>
            </ul>
            {(sinCriterio > 0 || datos.fuera.sin_fecha > 0) && (
              <p className={styles.aviso}>
                No se cuentan: {sinCriterio} informes sin criterio para juzgarlos (especie sin tabla de límites o sin analitos con límite)
                {datos.fuera.sin_fecha > 0 ? `, ${datos.fuera.sin_fecha} sin fecha` : ''}.
              </p>
            )}
          </details>
        </>
      )}
    </div>
  )
}
