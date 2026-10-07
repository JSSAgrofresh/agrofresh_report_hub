import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import {
  cajaTodos,
  cajasPorLaboratorio,
  claveLaboratorio,
  cuelloDeBotella,
  cumplimientoPorLab,
  desgloseTramos,
  evaluarTodas,
  resumenCumplimiento,
  resumenLeadTime,
  sensibilidad,
  seriePorMes,
  useEntrega,
} from '@/features/auditoriaInterna'
import type { Definicion, EvaluadaEntrega, PuntoMes, SolicitudAuditoria, Veredicto } from '@/features/auditoriaInterna'
import { formatDateCL } from '@/lib/locale'
import styles from './IndicadoresEntrega.module.css'

const nf = new Intl.NumberFormat('es-CL')
const f1 = (v: number | null | undefined) =>
  v == null || Number.isNaN(v) ? '—' : v.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const pc = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v)} %`)

/** Un color por tramo, el mismo en todo el bloque. Validados juntos (CVD ΔE ≥ 18); el
 * tramo siempre se nombra en la leyenda y en el desglose, el color no lleva el dato solo. */
const COLOR_TRAMO: Record<string, string> = { envio: '#1C7FA6', laboratorio: '#c9741f', report: '#7a5fc4', cliente: '#3d8f2a' }

const VEREDICTO: Record<Veredicto, { texto: string; tono: string }> = {
  cumplio: { texto: 'A tiempo', tono: 'bueno' },
  tarde: { texto: 'Entregada tarde', tono: 'aviso' },
  vencida: { texto: 'Vencida sin entregar', tono: 'malo' },
  plazo: { texto: 'En plazo', tono: '' },
  sin_plazo: { texto: 'Sin plazo', tono: '' },
  excluida: { texto: 'Fechas que no cuadran', tono: '' },
}

function Spark({ valores, formato }: { valores: (number | null)[]; formato: (v: number) => string }) {
  const v = valores.filter((x): x is number => x != null)
  if (v.length < 2) return null
  const mn = Math.min(...v)
  const mx = Math.max(...v)
  const W = 160
  const H = 30
  const x = (i: number) => 3 + (i * (W - 6)) / (valores.length - 1)
  const y = (n: number) => H - 4 - ((H - 8) * (n - mn)) / (mx - mn || 1)
  let d = ''
  let pen = false
  valores.forEach((n, i) => {
    if (n == null) {
      pen = false
      return
    }
    d += `${pen ? 'L' : 'M'}${x(i)} ${y(n)}`
    pen = true
  })
  const ult = valores.length - 1
  return (
    <svg className={styles.spark} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Últimos ${valores.length} meses`}>
      <path d={d} fill="none" stroke="var(--color-primary)" strokeWidth={2} strokeLinejoin="round" />
      {valores[ult] != null && (
        <circle cx={x(ult)} cy={y(valores[ult] as number)} r={3.5} fill="var(--color-primary)">
          <title>{formato(valores[ult] as number)}</title>
        </circle>
      )}
    </svg>
  )
}

function copiar(filas: string[][], boton: HTMLButtonElement) {
  const texto = filas.map((f) => f.join('\t')).join('\n')
  const original = boton.textContent
  const listo = (t: string) => {
    boton.textContent = t
    window.setTimeout(() => { boton.textContent = original }, 1800)
  }
  try {
    navigator.clipboard.writeText(texto).then(() => listo('Copiado ✓'), () => listo('Selecciona la tabla y copia'))
  } catch {
    listo('Selecciona la tabla y copia')
  }
}

const dia = (iso: string | null | undefined) => (iso ? formatDateCL(iso) : '—')

/**
 * Lead time y cumplimiento del entregable.
 *
 * Cada número se puede defender: debajo de cada indicador está la fórmula con las
 * cifras reales, qué entra y qué queda fuera, de dónde sale cada fecha y la tabla
 * de solicitudes que hay detrás. Las dos únicas reglas que se discuten (qué es
 * «entregado» y el plazo de cada laboratorio) están arriba, a la vista.
 */
export function IndicadoresEntrega({ solicitudes, puedeEditar }: { solicitudes: SolicitudAuditoria[]; puedeEditar: boolean }) {
  const { hitos, calidad, reglas, error, guardar } = useEntrega()
  const [ahora] = useState(() => Date.now())
  const [borrador, setBorrador] = useState<{ entregado: Definicion; plazos: Record<string, string> } | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null)
  const [estadistico, setEstadistico] = useState<0.5 | 0.9>(0.5)
  const [labElegido, setLabElegido] = useState('')
  const [labCum, setLabCum] = useState('')
  const [filtroVer, setFiltroVer] = useState<'' | 'atrasada' | Veredicto>('')
  const [verTodasLead, setVerTodasLead] = useState(false)
  const [verTodasCum, setVerTodasCum] = useState(false)

  const labs = useMemo(() => {
    const s = new Set<string>()
    solicitudes.forEach((x) => { if (claveLaboratorio(x.laboratorio)) s.add(claveLaboratorio(x.laboratorio)) })
    Object.keys(reglas?.plazos ?? {}).forEach((l) => s.add(l))
    return [...s].sort()
  }, [solicitudes, reglas])

  // Lo que se calcula: lo guardado, o el borrador si el admin está probando otros valores.
  const definicion: Definicion = borrador?.entregado ?? reglas?.entregado ?? 'concretado'
  const plazos = useMemo(() => {
    if (!borrador) return reglas?.plazos ?? {}
    const p: Record<string, number> = {}
    Object.entries(borrador.plazos).forEach(([l, v]) => {
      const n = Number(v)
      if (Number.isInteger(n) && n >= 1 && n <= 365) p[l] = n
    })
    return p
  }, [borrador, reglas])

  const ev = useMemo(
    () => (hitos ? evaluarTodas(solicitudes, hitos, definicion, plazos, ahora) : []),
    [solicitudes, hitos, definicion, plazos, ahora],
  )
  const hayPlazos = Object.keys(plazos).length > 0

  const lead = useMemo(() => resumenLeadTime(ev), [ev])
  const cajas = useMemo(() => cajasPorLaboratorio(ev, plazos), [ev, plazos])
  const todosCaja = useMemo(() => cajaTodos(ev), [ev])
  const desglose = useMemo(() => desgloseTramos(ev, definicion, estadistico, labElegido || undefined), [ev, definicion, estadistico, labElegido])
  const cuello = useMemo(() => cuelloDeBotella(desglose), [desglose])
  const serie = useMemo(() => seriePorMes(ev), [ev])
  const cum = useMemo(() => resumenCumplimiento(ev), [ev])
  const porLab = useMemo(() => cumplimientoPorLab(ev), [ev])
  const sens = useMemo(() => sensibilidad(ev, [-2, 0, 2, 5]), [ev])

  if (error) {
    return <p className={styles.error} role="alert">{error}</p>
  }
  if (!hitos || !reglas) {
    return <p className={styles.cargando} aria-busy="true">Calculando lead time y cumplimiento…</p>
  }

  const sucio =
    borrador != null &&
    (borrador.entregado !== reglas.entregado ||
      labs.some((l) => (borrador.plazos[l] ?? '') !== String(reglas.plazos[l] ?? '')))

  function editar(cambio: Partial<{ entregado: Definicion; plazos: Record<string, string> }>) {
    const base = borrador ?? {
      entregado: reglas?.entregado ?? 'concretado',
      plazos: Object.fromEntries(labs.map((l) => [l, String(reglas?.plazos[l] ?? '')])),
    }
    setBorrador({ ...base, ...cambio, plazos: { ...base.plazos, ...(cambio.plazos ?? {}) } })
  }

  async function guardarReglas() {
    if (!borrador) return
    setGuardando(true)
    setErrorGuardar(null)
    try {
      const p: Record<string, number | null> = {}
      labs.forEach((l) => {
        const n = Number(borrador.plazos[l])
        p[l] = borrador.plazos[l] && Number.isInteger(n) ? n : null
      })
      await guardar(borrador.entregado, p)
      setBorrador(null)
    } catch (e) {
      setErrorGuardar(e instanceof Error ? e.message : 'No se pudieron guardar las reglas.')
    } finally {
      setGuardando(false)
    }
  }

  const textoFin = definicion === 'cliente' ? 'Enviado al cliente' : 'PDF + resultados en Report'
  const maxCaja = Math.max(10, todosCaja?.p90 ?? 0, ...cajas.map((c) => c.p90), ...cajas.map((c) => c.plazo ?? 0))
  const tope = Math.ceil(maxCaja / 5) * 5
  const x = (v: number) => `${(v / tope) * 100}%`
  const sinAmarre = definicion === 'cliente' && calidad != null && calidad.envios_amarrados === 0

  // ── registros ──
  const filasLead = [...ev]
    .filter((e) => e.veredicto !== 'excluida')
    .sort((a, b) => (b.dias ?? b.edad) - (a.dias ?? a.edad))
  const colsLead: [string, (e: EvaluadaEntrega) => string, boolean?][] = [
    ['Solicitud', (e) => e.sol.numero_solicitud ?? e.sol.archivo],
    ['Laboratorio', (e) => e.sol.laboratorio ?? '—'],
    ['Cliente', (e) => e.sol.sold_to ?? '—'],
    ['Emitida', (e) => dia(e.sol.emitida_en)],
    ['Enviada', (e) => dia(e.hitos?.enviada)],
    ['Informe', (e) => dia(e.hitos?.informe)],
    ['En Report', (e) => dia(e.hitos?.report)],
    ['Al cliente', (e) => dia(e.hitos?.cliente)],
    ['Lead time', (e) => (e.dias != null ? `${f1(e.dias)} d` : `abierta (${Math.floor(e.edad)} d)`), true],
  ]
  const filasCum = ev
    .filter((e) => (!labCum || claveLaboratorio(e.sol.laboratorio) === labCum))
    .filter((e) => !filtroVer || (filtroVer === 'atrasada' ? e.veredicto === 'tarde' || e.veredicto === 'vencida' : e.veredicto === filtroVer))
  const orden: Record<Veredicto, number> = { vencida: 0, tarde: 1, plazo: 2, sin_plazo: 3, cumplio: 4, excluida: 5 }
  filasCum.sort((a, b) => orden[a.veredicto] - orden[b.veredicto] || (b.dias ?? b.edad) - (a.dias ?? a.edad))
  const colsCum: [string, (e: EvaluadaEntrega) => string, boolean?][] = [
    ['Solicitud', (e) => e.sol.numero_solicitud ?? e.sol.archivo],
    ['Laboratorio', (e) => e.sol.laboratorio ?? '—'],
    ['Cliente', (e) => e.sol.sold_to ?? '—'],
    ['Emitida', (e) => dia(e.sol.emitida_en)],
    ['Entregada', (e) => (e.fin != null ? formatDateCL(new Date(e.fin)) : '—')],
    ['Plazo', (e) => (e.plazo != null ? `${e.plazo} d` : '—'), true],
    ['Días', (e) => (e.dias != null ? f1(e.dias) : `${Math.floor(e.edad)} (abierta)`), true],
    ['Resultado', (e) => VEREDICTO[e.veredicto].texto],
  ]

  const tabla = (filas: EvaluadaEntrega[], cols: typeof colsLead, ver: boolean, alternar: () => void) => (
    <>
      <div className={styles.cajaTabla}>
        <table className={styles.tabla}>
          <thead>
            <tr>{cols.map(([t, , num]) => <th key={t} className={num ? styles.num : undefined}>{t}</th>)}</tr>
          </thead>
          <tbody>
            {(ver ? filas : filas.slice(0, 10)).map((e) => (
              <tr key={e.sol.archivo}>
                {cols.map(([t, f, num]) => (
                  <td key={t} className={num ? styles.num : undefined}>
                    {t === 'Resultado' ? <span className={`${styles.chip} ${styles[VEREDICTO[e.veredicto].tono] ?? ''}`}>{f(e)}</span> : f(e)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filas.length > 10 && (
        <button type="button" className={styles.mini} onClick={alternar}>{ver ? 'Mostrar menos' : `Ver las ${nf.format(filas.length)}`}</button>
      )}
    </>
  )

  return (
    <div className={styles.bloque}>
      {/* ───────── Reglas ───────── */}
      <section className={`${styles.tarjeta} ${styles.reglas}`} aria-labelledby="ie-reglas">
        <header className={styles.cabecera}>
          <div>
            <span className={styles.sobre}>Reglas del cálculo · valen para lead time y cumplimiento</span>
            <h3 id="ie-reglas">Qué cuenta como entregado y cuánto plazo hay</h3>
            <p>
              Son las dos únicas cosas que se discuten; todo lo demás es aritmética sobre fechas que el sistema ya guarda.
              {!puedeEditar && ' Solo el administrador general puede cambiarlas.'}
            </p>
          </div>
          <div className={styles.campo}>
            <span className={styles.sobre}>«Entregado» es</span>
            <div className={styles.segmentado} role="group" aria-label="Definición de entregado">
              {([['concretado', 'PDF + Report'], ['cliente', 'Enviado al cliente']] as const).map(([v, t]) => (
                <button key={v} type="button" aria-pressed={definicion === v} disabled={!puedeEditar} onClick={() => editar({ entregado: v })}>{t}</button>
              ))}
            </div>
          </div>
        </header>
        <div>
          <span className={styles.sobre}>Plazo comprometido, en días desde que se emitió la solicitud</span>
          <div className={styles.plazos}>
            {labs.map((l) => (
              <label key={l} className={styles.plazo} htmlFor={`plazo-${l}`}>
                {l}
                <span>
                  <input
                    id={`plazo-${l}`}
                    type="number"
                    min={1}
                    max={365}
                    inputMode="numeric"
                    placeholder="—"
                    disabled={!puedeEditar}
                    value={borrador ? borrador.plazos[l] ?? '' : String(reglas.plazos[l] ?? '')}
                    onChange={(e) => editar({ plazos: { [l]: e.target.value } })}
                  />{' '}
                  <small>d</small>
                </span>
              </label>
            ))}
          </div>
        </div>
        {sucio && (
          <div className={styles.borrador} role="status">
            <span>Estás viendo una <b>prueba sin guardar</b>: los números de abajo ya usan estos valores.</span>
            <span className={styles.accionesBorrador}>
              <Button variant="ghost" onClick={() => { setBorrador(null); setErrorGuardar(null) }}>Descartar</Button>
              <Button onClick={() => void guardarReglas()} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar reglas'}</Button>
            </span>
          </div>
        )}
        {errorGuardar && <p className={styles.error} role="alert">{errorGuardar}</p>}
        {reglas.cambiado_en && (
          <p className={styles.pie}>Última vez guardadas por {reglas.cambiado_por ?? '—'} el {formatDateCL(reglas.cambiado_en)}.</p>
        )}
        {sinAmarre && (
          <p className={styles.aviso} role="note">
            Todavía ningún envío a clientes está amarrado a su solicitud (
            {calidad?.envios_a_clientes != null ? `${calidad.envios_a_clientes} enviados` : 'sin envíos'}). Los nuevos desde «Envío de informes» sí quedan
            amarrados, siempre que se haya corrido la migración 0054; con «PDF + Report» el cálculo ya funciona con todo el historial.
          </p>
        )}
      </section>

      {/* ───────── Lead time ───────── */}
      <section className={styles.tarjeta} aria-labelledby="ie-lead">
        <header className={styles.cabecera}>
          <div>
            <span className={styles.sobre}>Indicador</span>
            <h3 id="ie-lead">Lead time: de la solicitud a lo entregado</h3>
          </div>
          <div className={styles.segmentado} role="group" aria-label="Estadístico del desglose">
            <button type="button" aria-pressed={estadistico === 0.5} onClick={() => setEstadistico(0.5)}>Mediana</button>
            <button type="button" aria-pressed={estadistico === 0.9} onClick={() => setEstadistico(0.9)}>Percentil 90</button>
          </div>
        </header>

        {lead.entregadas === 0 ? (
          <p className={styles.vacio}>Todavía no hay solicitudes entregadas con estos filtros ({nf.format(lead.abiertas)} siguen abiertas).</p>
        ) : (
          <>
            <div className={styles.tiles}>
              <div className={styles.tile}>
                <span className={styles.et}>Lead time mediano</span>
                <span className={styles.gr}>{f1(lead.p50)}<small>días</small></span>
                <span className={styles.ap}>la mitad de las solicitudes tarda menos que esto</span>
                <Spark valores={serie.map((p: PuntoMes) => p.p50)} formato={(v) => `${f1(v)} d`} />
              </div>
              <div className={styles.tile}>
                <span className={styles.et}>Casos lentos (P90)</span>
                <span className={styles.gr}>{f1(lead.p90)}<small>días</small></span>
                <span className={styles.ap}>9 de cada 10 se entregan en este tiempo o menos</span>
              </div>
              <div className={styles.tile}>
                <span className={styles.et}>Cuello de botella</span>
                <span className={`${styles.gr} ${styles.grTexto}`}>{cuello ? cuello.tramo.nombre : '—'}</span>
                <span className={styles.ap}>{cuello ? `${f1(cuello.tramo.valor)} d · ${pc(cuello.pct)} del total${labElegido ? ` · ${labElegido}` : ''}` : 'Faltan fechas de envío para medir los tramos'}</span>
              </div>
              <div className={styles.tile}>
                <span className={styles.et}>Aún abiertas</span>
                <span className={styles.gr}>{nf.format(lead.abiertas)}</span>
                <span className={styles.ap}>{lead.abiertas ? `edad mediana ${f1(lead.edadMedianaAbiertas)} d · no entran al cálculo` : 'ninguna'}</span>
              </div>
            </div>

            <div className={styles.dos}>
              <div className={styles.columna}>
                <span className={styles.sobre}>Rango típico por laboratorio · toca uno para ver su desglose</span>
                <div className={styles.cajas}>
                  {[...(todosCaja ? [todosCaja] : []), ...cajas].map((c) => {
                    const nombre = c.lab || 'Todos'
                    return (
                      <button
                        key={nombre}
                        type="button"
                        className={styles.caja}
                        aria-pressed={labElegido === c.lab}
                        aria-label={`${nombre}: mediana ${f1(c.p50)} días, ${c.n} entregadas`}
                        onClick={() => setLabElegido(labElegido === c.lab ? '' : c.lab)}
                      >
                        <span className={styles.nom}>{nombre}<small>{nf.format(c.n)} entregadas</small></span>
                        <span className={styles.pista}>
                          <i className={styles.eje} />
                          <i className={styles.bigote} style={{ left: x(c.p10), width: `${((c.p90 - c.p10) / tope) * 100}%` }} />
                          <i className={styles.cuerpo} style={{ left: x(c.p25), width: `${Math.max(0.8, ((c.p75 - c.p25) / tope) * 100)}%` }} />
                          <i className={styles.mediana} style={{ left: x(c.p50) }} />
                          {c.plazo != null && <i className={styles.plazoMarca} style={{ left: x(c.plazo) }} title={`Plazo ${c.plazo} d`} />}
                        </span>
                        <span className={styles.val}>{f1(c.p50)} d<small>P90 {f1(c.p90)}</small></span>
                      </button>
                    )
                  })}
                  <div className={styles.escala} aria-hidden="true"><span /><div><span>0</span><span>{tope / 2} d</span><span>{tope} d</span></div><span /></div>
                </div>
                <div className={styles.leyenda}>
                  <span><i className={styles.lCuerpo} />50 % central (P25–P75)</span>
                  <span><i className={styles.lMed} />mediana</span>
                  {hayPlazos && <span><i className={styles.lPlazo} />plazo comprometido</span>}
                </div>
              </div>

              <div className={styles.columna}>
                <span className={styles.sobre}>Desglose por tramo · {labElegido || 'Todos'} · {estadistico === 0.5 ? 'mediana' : 'percentil 90'}</span>
                {desglose.every((t) => t.n === 0) ? (
                  <p className={styles.vacio}>No hay solicitudes con las fechas necesarias para medir los tramos.</p>
                ) : (
                  <div>
                    {(() => {
                      const suma = desglose.reduce((s, t) => s + t.valor, 0)
                      return desglose.map((t) => (
                        <div key={t.clave} className={styles.tramo}>
                          <span className={styles.nom}>
                            <i className={styles.punto} style={{ background: COLOR_TRAMO[t.clave] }} />
                            {t.nombre}
                            <small>{cuello?.tramo.clave === t.clave ? 'cuello de botella · ' : ''}{nf.format(t.n)} solicitudes con este tramo completo</small>
                          </span>
                          <b>{t.n ? `${f1(t.valor)} d` : '—'}</b>
                          <span className={styles.pctTramo}>{t.n && suma ? pc((t.valor / suma) * 100) : ''}</span>
                          <div className={styles.barra}><i style={{ width: `${suma ? (t.valor / suma) * 100 : 0}%`, background: COLOR_TRAMO[t.clave] }} /></div>
                        </div>
                      ))
                    })()}
                    <p className={styles.pie}>Los tramos no suman exactamente el total: el total se calcula sobre cada solicitud completa.</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        <details className={styles.como} open>
          <summary>¿Cómo se calcula este número?</summary>
          <div>
            <p>
              <b>Fórmula.</b> Para cada solicitud: <code>lead time = fecha en que quedó «{textoFin}» − fecha en que se emitió la solicitud</code>,
              en días corridos. El número grande es la <b>mediana</b> de las solicitudes ya entregadas.
            </p>
            <div className={styles.cal}>
              <div><b>{nf.format(lead.total)}</b>solicitudes del alcance (filtros de la página, sin solicitudes de prueba)</div>
              <div><b>{nf.format(lead.entregadas)}</b>entran al cálculo: ya llegaron a «{textoFin}»</div>
              <div><b>{nf.format(lead.abiertas)}</b>quedan fuera: siguen abiertas (se informan aparte)</div>
              {lead.excluidas > 0 && <div><b>{nf.format(lead.excluidas)}</b>quedan fuera: tienen una fecha anterior a la emisión</div>}
            </div>
            <p>
              <b>Por qué la mediana y no el promedio.</b> Unas pocas solicitudes muy atrasadas inflan el promedio y no representan lo normal.
              La mediana dice qué tarda lo típico y el P90 cuánto tardan los lentos. Aquí el promedio sería {f1(lead.promedio)} d contra una mediana de {f1(lead.p50)} d.
            </p>
            <p>
              <b>Qué no cuenta.</b> Una solicitud abierta todavía no tiene lead time; dejarla fuera hace que el número se vea mejor de lo que es,
              por eso se informa aparte ({nf.format(lead.abiertas)}, edad mediana {f1(lead.edadMedianaAbiertas)} d).
            </p>
            <p><b>De dónde sale cada fecha</b></p>
            <ol>
              <li>Solicitud emitida: cuándo se creó la solicitud en el sistema.</li>
              <li>Enviada al laboratorio: el primer envío exitoso del correo de la solicitud.</li>
              <li>
                Informe recibido: la «fecha de envío» que anotó una persona al subir el PDF y, si no la hay, el momento en que se subió
                {lead.entregadas ? ` (${nf.format(lead.conFechaAnotada)} de ${nf.format(lead.entregadas)} tienen fecha anotada)` : ''}.
              </li>
              <li>
                Resultados en Report: cuándo se hizo la carga de datos
                {lead.sinFechaReport ? `; en ${nf.format(lead.sinFechaReport)} no hay fecha de carga (cargas antiguas) y se usó la del informe` : ''}.
              </li>
              {definicion === 'cliente' && <li>Enviado al cliente: el primer envío exitoso en modo producción desde «Envío de informes», amarrado a la solicitud.</li>}
            </ol>
          </div>
        </details>

        <details className={styles.como}>
          <summary>Ver las solicitudes que hay detrás <span className={styles.chip}>{nf.format(filasLead.length)}</span></summary>
          <div>
            <div className={styles.fl}>
              <span className={styles.pie}>De la más lenta a la más rápida.</span>
              <button type="button" className={styles.copiar} onClick={(e) => copiar([colsLead.map((c) => c[0]), ...filasLead.map((r) => colsLead.map((c) => c[1](r)))], e.currentTarget)}>
                Copiar tabla
              </button>
            </div>
            {tabla(filasLead, colsLead, verTodasLead, () => setVerTodasLead((v) => !v))}
          </div>
        </details>
      </section>

      {/* ───────── Cumplimiento ───────── */}
      <section className={styles.tarjeta} aria-labelledby="ie-cum">
        <header className={styles.cabecera}>
          <div>
            <span className={styles.sobre}>Indicador</span>
            <h3 id="ie-cum">Cumplimiento del entregable</h3>
          </div>
        </header>

        {!hayPlazos ? (
          <p className={styles.vacio}>
            Para calcular el cumplimiento hace falta el plazo de cada laboratorio. {puedeEditar ? 'Escríbelos arriba, en «Reglas del cálculo».' : 'Pídele al administrador general que los cargue.'}
            {' '}No se asume ninguno.
          </p>
        ) : (
          <>
            <div className={styles.tiles}>
              <div className={styles.tile}>
                <span className={styles.et}>Cumplimiento</span>
                <span className={`${styles.gr} ${cum.pct == null ? '' : cum.pct >= 90 ? styles.bueno : cum.pct >= 75 ? styles.regular : styles.malo}`}>{cum.pct == null ? '—' : Math.round(cum.pct)}<small>%</small></span>
                <span className={styles.ap}>{nf.format(cum.cumplio)} de {nf.format(cum.vencidas)} entregables que ya vencieron</span>
                <Spark valores={serie.map((p) => p.pct)} formato={(v) => `${Math.round(v)} %`} />
              </div>
              <div className={styles.tile}>
                <span className={styles.et}>Entregadas a tiempo</span>
                <span className={`${styles.gr} ${styles.bueno}`}>{nf.format(cum.cumplio)}</span>
                <span className={styles.ap}>dentro del plazo de su laboratorio</span>
              </div>
              <div className={styles.tile}>
                <span className={styles.et}>Atrasadas</span>
                <span className={`${styles.gr} ${styles.malo}`}>{nf.format(cum.tarde + cum.vencida)}</span>
                <span className={styles.ap}>{nf.format(cum.tarde)} entregadas tarde · {nf.format(cum.vencida)} vencidas sin entregar</span>
              </div>
              <div className={styles.tile}>
                <span className={styles.et}>Aún en plazo</span>
                <span className={styles.gr}>{nf.format(cum.plazo)}</span>
                <span className={styles.ap}>todavía no vencen: no suben ni bajan el %{cum.sinPlazo ? ` · ${nf.format(cum.sinPlazo)} sin plazo de su laboratorio` : ''}</span>
              </div>
            </div>

            <div className={styles.ecuacion} aria-label="Fórmula con las cifras reales">
              <div className={styles.termino}><b className={styles.bueno}>{nf.format(cum.cumplio)}</b><span>entregadas a tiempo</span></div>
              <span className={styles.op}>÷</span><span className={styles.op}>(</span>
              <div className={styles.termino}><b className={styles.bueno}>{nf.format(cum.cumplio)}</b><span>a tiempo</span></div>
              <span className={styles.op}>+</span>
              <div className={styles.termino}><b className={styles.malo}>{nf.format(cum.tarde)}</b><span>entregadas tarde</span></div>
              <span className={styles.op}>+</span>
              <div className={styles.termino}><b className={styles.malo}>{nf.format(cum.vencida)}</b><span>vencidas sin entregar</span></div>
              <span className={styles.op}>)</span><span className={styles.op}>=</span>
              <div className={styles.termino}><b>{cum.pct == null ? '—' : `${f1(cum.pct)} %`}</b><span>cumplimiento</span></div>
            </div>

            <div className={styles.dos}>
              <div className={styles.columna}>
                <span className={styles.sobre}>Por laboratorio · toca uno para filtrar los registros</span>
                <div className={styles.cajas}>
                  {porLab.map(({ lab, plazo, r, total }) => (
                    <button key={lab} type="button" className={styles.caja} style={{ gridTemplateColumns: '104px minmax(0,1fr) 58px' }} aria-pressed={labCum === lab} onClick={() => setLabCum(labCum === lab ? '' : lab)}>
                      <span className={styles.nom}>{lab}<small>{plazo != null ? `plazo ${plazo} d · ${nf.format(r.vencidas)} vencidas` : 'sin plazo cargado'}</small></span>
                      <span className={styles.apilada} role="img" aria-label={`${lab}: ${r.cumplio} a tiempo, ${r.tarde + r.vencida} atrasadas, ${r.plazo + r.sinPlazo} sin juzgar`}>
                        <span style={{ width: `${(r.cumplio / total) * 100}%`, background: '#1b7f5c' }} title={`A tiempo: ${r.cumplio}`} />
                        <span style={{ width: `${((r.tarde + r.vencida) / total) * 100}%`, background: 'var(--color-danger)' }} title={`Atrasadas: ${r.tarde + r.vencida}`} />
                        <span className={styles.sinJuzgar} style={{ width: `${((r.plazo + r.sinPlazo + r.excluidas) / total) * 100}%` }} title={`Sin juzgar: ${r.plazo + r.sinPlazo + r.excluidas}`} />
                      </span>
                      <span className={`${styles.val} ${r.pct != null && r.pct < 75 ? styles.malo : ''}`}>{pc(r.pct)}</span>
                    </button>
                  ))}
                </div>
                <div className={styles.leyenda}>
                  <span><i style={{ background: '#1b7f5c' }} />A tiempo</span>
                  <span><i style={{ background: 'var(--color-danger)' }} />Atrasadas</span>
                  <span><i className={styles.lSinJuzgar} />Aún en plazo o sin plazo</span>
                </div>
              </div>
              <div className={styles.columna}>
                <span className={styles.sobre}>¿Y si el plazo fuera otro?</span>
                <div className={styles.sens}>
                  {sens.map((s) => (
                    <div key={s.delta} className={s.delta === 0 ? styles.sensActual : undefined}>
                      <b>{s.pct == null ? '—' : `${Math.round(s.pct)} %`}</b>
                      <span>{s.delta === 0 ? 'plazos actuales' : `${s.delta > 0 ? '+' : '−'}${Math.abs(s.delta)} días de plazo`}</span>
                    </div>
                  ))}
                </div>
                <p className={styles.pie}>Sirve para defender el plazo: si un día más mueve mucho el %, el plazo está mal puesto o el proceso está al límite.</p>
              </div>
            </div>
          </>
        )}

        <details className={styles.como} open>
          <summary>¿Cómo se calcula este número?</summary>
          <div>
            <p><b>Fórmula.</b> <code>cumplimiento = entregadas a tiempo ÷ (a tiempo + entregadas tarde + vencidas sin entregar)</code></p>
            <div className={styles.cal}>
              <div><b>{nf.format(cum.cumplio + cum.tarde + cum.vencida + cum.plazo + cum.sinPlazo + cum.excluidas)}</b>solicitudes del alcance (sin solicitudes de prueba)</div>
              <div><b>{nf.format(cum.vencidas)}</b>cuentan: ya debían estar entregadas</div>
              <div><b>{nf.format(cum.plazo)}</b>no cuentan todavía: su plazo no ha vencido</div>
              {cum.sinPlazo > 0 && <div><b>{nf.format(cum.sinPlazo)}</b>no se juzgan: su laboratorio no tiene plazo cargado</div>}
              {cum.excluidas > 0 && <div><b>{nf.format(cum.excluidas)}</b>quedan fuera: tienen una fecha anterior a la emisión</div>}
            </div>
            <ol>
              <li><b>A tiempo:</b> llegó a «{textoFin}» dentro del plazo de su laboratorio, contado desde que se emitió la solicitud.</li>
              <li><b>Entregada tarde:</b> llegó, pero después del plazo.</li>
              <li><b>Vencida sin entregar:</b> no ha llegado y ya pasó su plazo. Cuenta como incumplida desde el día siguiente al vencimiento; si se entrega después, pasa a «entregada tarde».</li>
              <li><b>Aún en plazo:</b> no ha llegado y el plazo no vence. Se deja fuera para no premiar ni castigar lo que todavía no se puede juzgar.</li>
            </ol>
            <p><b>Qué mueve el número.</b> Solo dos reglas, las dos a la vista arriba: qué cuenta como «entregado» y el plazo de cada laboratorio. La tabla de sensibilidad muestra cuánto cambia el % si el plazo se mueve.</p>
          </div>
        </details>

        <details className={styles.como}>
          <summary>Ver las solicitudes que hay detrás <span className={styles.chip}>{nf.format(filasCum.length)}</span></summary>
          <div>
            <div className={styles.fl}>
              {([['', 'Todas'], ['atrasada', 'Atrasadas'], ['cumplio', 'A tiempo'], ['plazo', 'En plazo']] as const).map(([v, t]) => (
                <button key={v} type="button" className={styles.mini} aria-pressed={filtroVer === v} onClick={() => setFiltroVer(v)}>{t}</button>
              ))}
              {labCum && <span className={styles.chip}>{labCum}</span>}
              <button type="button" className={styles.copiar} onClick={(e) => copiar([colsCum.map((c) => c[0]), ...filasCum.map((r) => colsCum.map((c) => c[1](r)))], e.currentTarget)}>
                Copiar tabla
              </button>
            </div>
            {tabla(filasCum, colsCum, verTodasCum, () => setVerTodasCum((v) => !v))}
          </div>
        </details>
      </section>
    </div>
  )
}

