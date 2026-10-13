import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import {
  claveLaboratorio,
  RECEPCION_ESTIMADA_DIAS,
  clavePlazoAnalisis,
  cumplimientoPorAnalisis,
  cumplimientoPorLab,
  evaluarTodas,
  resumenCumplimiento,
  resumenLeadTime,
  sensibilidad,
  seriePorMes,
  useEntrega,
} from '@/features/auditoriaInterna'
import type { Definicion, EvaluadaEntrega, PuntoMes, SolicitudAuditoria, Veredicto } from '@/features/auditoriaInterna'
import { formatDateCL } from '@/lib/locale'
import { FlujogramaLeadTime } from './FlujogramaLeadTime'
import styles from './IndicadoresEntrega.module.css'

const nf = new Intl.NumberFormat('es-CL')
const f1 = (v: number | null | undefined) =>
  v == null || Number.isNaN(v) ? '—' : v.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const pc = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v)} %`)

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

/** Un «i» que explica al pasar el mouse, al enfocar con el teclado o al tocar. */
function Ayuda({ children, etiqueta = 'Más información' }: { children: React.ReactNode; etiqueta?: string }) {
  return (
    <span className={styles.ayuda} tabIndex={0} role="note" aria-label={etiqueta}>
      <span aria-hidden="true">i</span>
      <span className={styles.burbuja} role="tooltip">{children}</span>
    </span>
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
  const [vistaCum, setVistaCum] = useState<'laboratorio' | 'analisis'>('laboratorio')
  const [labElegido, setLabElegido] = useState('')
  const [labCum, setLabCum] = useState('')
  const [filtroVer, setFiltroVer] = useState<'' | 'atrasada' | Veredicto>('')
  const [verTodasLead, setVerTodasLead] = useState(false)
  const [verTodasCum, setVerTodasCum] = useState(false)

  const labs = useMemo(() => {
    const s = new Set<string>()
    solicitudes.forEach((x) => { if (claveLaboratorio(x.laboratorio)) s.add(claveLaboratorio(x.laboratorio)) })
    Object.keys(reglas?.plazos ?? {}).forEach((k) => s.add(k.split('|')[0]))
    return [...s].sort()
  }, [solicitudes, reglas])
  // Los análisis que se han pedido a cada laboratorio: cada uno puede tener su propio plazo.
  const analitosPorLab = useMemo(() => {
    const por = new Map<string, Set<string>>()
    solicitudes.forEach((x) => {
      const lab = claveLaboratorio(x.laboratorio)
      if (!lab) return
      const set = por.get(lab) ?? new Set<string>()
      ;(x.analitos ?? []).forEach((a) => { if (a.trim()) set.add(a.trim().toUpperCase()) })
      por.set(lab, set)
    })
    Object.keys(reglas?.plazos ?? {}).forEach((k) => {
      const [lab, analito] = k.split('|')
      if (analito) por.set(lab, (por.get(lab) ?? new Set<string>()).add(analito))
    })
    return new Map([...por.entries()].map(([lab, set]) => [lab, [...set].sort()]))
  }, [solicitudes, reglas])
  // Todas las claves de plazo editables: «LAB» y «LAB|ANALITO».
  const claves = useMemo(
    () => labs.flatMap((l) => [l, ...(analitosPorLab.get(l) ?? []).map((a) => clavePlazoAnalisis(l, a))]),
    [labs, analitosPorLab],
  )

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
  const evFlujo = useMemo(() => (labElegido ? ev.filter((e) => claveLaboratorio(e.sol.laboratorio) === labElegido) : ev), [ev, labElegido])
  const serie = useMemo(() => seriePorMes(ev), [ev])
  const cum = useMemo(() => resumenCumplimiento(ev), [ev])
  const porLab = useMemo(() => cumplimientoPorLab(ev), [ev])
  const porAnalisis = useMemo(() => cumplimientoPorAnalisis(ev), [ev])
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
      claves.some((k) => (borrador.plazos[k] ?? '') !== String(reglas.plazos[k] ?? '')))

  function editar(cambio: Partial<{ entregado: Definicion; plazos: Record<string, string> }>) {
    const base = borrador ?? {
      entregado: reglas?.entregado ?? 'concretado',
      plazos: Object.fromEntries(claves.map((k) => [k, String(reglas?.plazos[k] ?? '')])),
    }
    setBorrador({ ...base, ...cambio, plazos: { ...base.plazos, ...(cambio.plazos ?? {}) } })
  }

  async function guardarReglas() {
    if (!borrador) return
    setGuardando(true)
    setErrorGuardar(null)
    try {
      const p: Record<string, number | null> = {}
      claves.forEach((k) => {
        const n = Number(borrador.plazos[k])
        p[k] = borrador.plazos[k] && Number.isInteger(n) ? n : null
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
    ['Lead time', (e) => (e.dias != null ? `${f1(e.dias)} d háb.` : `abierta (${f1(e.edad)} d háb.)`), true],
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
    ['Plazo', (e) => (e.plazo != null ? `${e.plazo} d háb.${e.analisis ? ` (${e.analisis})` : ''}` : '—'), true],
    ['Días háb.', (e) => (e.dias != null ? f1(e.dias) : `${f1(e.edad)} (abierta)`), true],
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
      {/* ───────── Supuesto (lo ve todo el mundo) ───────── */}
      <p className={styles.supuesto} role="note">
        <b>Estimado, no medido.</b> No sabemos cuándo el laboratorio pasa a retirar las muestras, así que se supone que las recibe{' '}
        {RECEPCION_ESTIMADA_DIAS} día después de emitida la solicitud (emitida el lunes 1, recepcionada el martes 2). Desde ahí corren los
        tiempos y plazos de abajo, en <b>días hábiles</b> (lunes a viernes, sin feriados). Todo cálculo de esta pantalla está sujeto a ese supuesto.
      </p>

      {/* ───────── Configuración (solo el administrador general) ───────── */}
      {puedeEditar && (
        <details className={`${styles.tarjeta} ${styles.config}`}>
          <summary>
            <span>Configuración de plazos</span>
            <small>solo la ve el administrador general</small>
          </summary>
          <div className={styles.configCuerpo}>
            <div className={styles.campo}>
              <span className={styles.sobre}>
                «Entregado» es
                <Ayuda>Vale para el lead time y el cumplimiento.</Ayuda>
              </span>
              <div className={styles.segmentado} role="group" aria-label="Definición de entregado">
                {([['concretado', 'PDF + Report'], ['cliente', 'Enviado al cliente']] as const).map(([v, t]) => (
                  <button key={v} type="button" aria-pressed={definicion === v} onClick={() => editar({ entregado: v })}>{t}</button>
                ))}
              </div>
            </div>

            <div>
              <span className={styles.sobre}>
                Plazo prometido, en días hábiles
                <Ayuda>
                  Cuenta desde la recepción estimada (emisión + {RECEPCION_ESTIMADA_DIAS} día), solo lunes a viernes. Cada laboratorio tiene un plazo general
                  y, si un análisis tarda distinto, su propio plazo: gana el análisis más lento de la solicitud.
                </Ayuda>
              </span>
              {labs.map((l) => (
                <div key={l} className={styles.configLab}>
                  <label className={styles.plazo} htmlFor={`plazo-${l}`}>
                    <b>{l}</b> · plazo general
                    <span>
                      <input
                        id={`plazo-${l}`}
                        type="number"
                        min={1}
                        max={365}
                        inputMode="numeric"
                        placeholder="—"
                        value={borrador ? borrador.plazos[l] ?? '' : String(reglas.plazos[l] ?? '')}
                        onChange={(e) => editar({ plazos: { [l]: e.target.value } })}
                      />{' '}
                      <small>d háb.</small>
                    </span>
                  </label>
                  {(analitosPorLab.get(l) ?? []).length > 0 && (
                    <div className={styles.analitosPlazo}>
                      <small>Plazo propio por análisis (vacío = rige el general)</small>
                      <div className={styles.plazos}>
                        {(analitosPorLab.get(l) ?? []).map((a) => {
                          const k = clavePlazoAnalisis(l, a)
                          return (
                            <label key={k} className={styles.plazo} htmlFor={`plazo-${k}`}>
                              {a}
                              <span>
                                <input
                                  id={`plazo-${k}`}
                                  type="number"
                                  min={1}
                                  max={365}
                                  inputMode="numeric"
                                  placeholder="—"
                                  value={borrador ? borrador.plazos[k] ?? '' : String(reglas.plazos[k] ?? '')}
                                  onChange={(e) => editar({ plazos: { [k]: e.target.value } })}
                                />{' '}
                                <small>d</small>
                              </span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {sucio && (
              <div className={styles.borrador} role="status">
                <span>Estás viendo una <b>prueba sin guardar</b>: los números de abajo ya usan estos valores.</span>
                <span className={styles.accionesBorrador}>
                  <Button variant="ghost" onClick={() => { setBorrador(null); setErrorGuardar(null) }}>Descartar</Button>
                  <Button onClick={() => void guardarReglas()} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar plazos'}</Button>
                </span>
              </div>
            )}
            {errorGuardar && <p className={styles.error} role="alert">{errorGuardar}</p>}
            {reglas.cambiado_en && (
              <p className={styles.pie}>Última vez guardados por {reglas.cambiado_por ?? '—'} el {formatDateCL(reglas.cambiado_en)}.</p>
            )}
            {sinAmarre && (
              <p className={styles.aviso} role="note">
                Todavía ningún envío a clientes está amarrado a su solicitud (
                {calidad?.envios_a_clientes != null ? `${calidad.envios_a_clientes} enviados` : 'sin envíos'}). Los nuevos desde «Envío de informes» sí quedan
                amarrados, siempre que se haya corrido la migración 0054; con «PDF + Report» el cálculo ya funciona con todo el historial.
              </p>
            )}
          </div>
        </details>
      )}

      {/* ───────── Lead time ───────── */}
      <section className={styles.tarjeta} aria-labelledby="ie-lead">
        <header className={styles.cabecera}>
          <div>
            <span className={styles.sobre}>Indicador</span>
            <h3 id="ie-lead">Lead time: de la recepción estimada a lo entregado</h3>
          </div>
        </header>

        {lead.entregadas === 0 ? (
          <p className={styles.vacio}>Todavía no hay solicitudes entregadas con estos filtros ({nf.format(lead.abiertas)} siguen abiertas).</p>
        ) : (
          <>
            <div className={styles.tiles}>
              <div className={styles.tile}>
                <span className={styles.et}>Lead time mediano</span>
                <span className={styles.gr}>{f1(lead.p50)}<small>días háb.</small></span>
                <span className={styles.ap}>
                  la mitad tarda menos
                </span>
                <Spark valores={serie.map((p: PuntoMes) => p.p50)} formato={(v) => `${f1(v)} d`} />
              </div>
              <div className={styles.tile}>
                <span className={styles.et}>Casos lentos (P90)</span>
                <span className={styles.gr}>{f1(lead.p90)}<small>días háb.</small></span>
                <span className={styles.ap}>
                  9 de cada 10, o menos
                  <Ayuda>Es el percentil 90: cuánto tardan los casos lentos.</Ayuda>
                </span>
              </div>
              <div className={styles.tile}>
                <span className={styles.et}>Aún abiertas</span>
                <span className={styles.gr}>{nf.format(lead.abiertas)}</span>
                <span className={styles.ap}>
                  {lead.abiertas ? `llevan ${f1(lead.edadMedianaAbiertas)} d háb. (mediana)` : 'ninguna'}
                  <Ayuda>No entran al cálculo: una solicitud abierta todavía no tiene lead time. Dejarla fuera haría que el número se vea mejor de lo que es, por eso se informa aparte.</Ayuda>
                </span>
              </div>
            </div>

            <FlujogramaLeadTime
              ev={evFlujo}
              laboratorios={labs}
              lab={labElegido}
              onLab={setLabElegido}
            />
          </>
        )}

        <p className={styles.formula}>
          <span><b>Lead time</b> = «{textoFin}» − recepción estimada (emisión + {RECEPCION_ESTIMADA_DIAS} día), en días hábiles</span>
          <span>{nf.format(lead.entregadas)} de {nf.format(lead.total)} solicitudes entran al cálculo</span>
          <Ayuda etiqueta="Cómo se calcula el lead time">
            <b>Qué entra.</b> {nf.format(lead.total)} solicitudes del alcance (filtros de la página, sin pruebas): {nf.format(lead.entregadas)} ya llegaron a «{textoFin}» y {nf.format(lead.abiertas)} siguen abiertas
            {lead.excluidas > 0 ? `; ${nf.format(lead.excluidas)} quedan fuera por tener una fecha anterior a la emisión` : ''}.
            <br />
            <b>De dónde sale cada fecha.</b> Emisión: cuándo se creó la solicitud; la recepción en el laboratorio se estima {RECEPCION_ESTIMADA_DIAS} día después (no la conocemos).
            Informe: la «fecha de envío» anotada al subir el PDF o, si no, cuando se subió{lead.entregadas ? ` (${nf.format(lead.conFechaAnotada)} de ${nf.format(lead.entregadas)} tienen fecha anotada)` : ''}.
            Report: cuándo se hizo la carga de datos{lead.sinFechaReport ? `; en ${nf.format(lead.sinFechaReport)} no hay fecha de carga y se usó la del informe` : ''}.
            {definicion === 'cliente' && ' Cliente: la fecha del check «enviado al cliente» marcado a mano.'}
          </Ayuda>
        </p>

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
      <details className={`${styles.tarjeta} ${styles.config}`}>
        <summary>
          <span>Cumplimiento del entregable</span>
          <small>qué parte llegó dentro del plazo, por laboratorio y por análisis</small>
        </summary>
        <div className={styles.configCuerpo}>

        {!hayPlazos ? (
          <p className={styles.vacio}>
            Para calcular el cumplimiento hace falta el plazo de cada laboratorio o análisis. {puedeEditar ? 'Escríbelos arriba, en «Configuración de plazos».' : 'Pídele al administrador general que los cargue.'}
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
                <span className={styles.ap}>dentro del plazo de su análisis</span>
              </div>
              <div className={styles.tile}>
                <span className={styles.et}>Atrasadas</span>
                <span className={`${styles.gr} ${styles.malo}`}>{nf.format(cum.tarde + cum.vencida)}</span>
                <span className={styles.ap}>{nf.format(cum.tarde)} entregadas tarde · {nf.format(cum.vencida)} vencidas sin entregar</span>
              </div>
              <div className={styles.tile}>
                <span className={styles.et}>Aún en plazo</span>
                <span className={styles.gr}>{nf.format(cum.plazo)}</span>
                <span className={styles.ap}>
                  todavía no vencen{cum.sinPlazo ? ` · ${nf.format(cum.sinPlazo)} sin plazo` : ''}
                  <Ayuda>No suben ni bajan el %: se dejan fuera para no premiar ni castigar lo que todavía no se puede juzgar.</Ayuda>
                </span>
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
                <div className={styles.cabVista}>
                  <span className={styles.sobre}>
                    {vistaCum === 'laboratorio' ? 'Por laboratorio' : 'Por análisis'}
                    <Ayuda>
                      {vistaCum === 'laboratorio'
                        ? 'Toca uno para filtrar los registros de abajo.'
                        : 'Agrupa cada solicitud por el análisis que fija su plazo (el más lento de los que pidió). «Plazo general» son las que usan el plazo del laboratorio.'}
                    </Ayuda>
                  </span>
                  <div className={styles.segmentado} role="group" aria-label="Agrupar cumplimiento por">
                    <button type="button" aria-pressed={vistaCum === 'laboratorio'} onClick={() => setVistaCum('laboratorio')}>Laboratorio</button>
                    <button type="button" aria-pressed={vistaCum === 'analisis'} onClick={() => { setVistaCum('analisis'); setLabCum('') }}>Análisis</button>
                  </div>
                </div>
                <div className={styles.cajas}>
                  {(vistaCum === 'laboratorio'
                    ? porLab.map(({ lab, plazo, r, total }) => ({ clave: lab, nombre: lab, plazo, r, total, activo: labCum === lab, elegible: true }))
                    : porAnalisis.map((x) => ({ clave: x.etiqueta, nombre: x.etiqueta, plazo: x.plazo, r: x.r, total: x.total, activo: false, elegible: false }))
                  ).map(({ clave, nombre, plazo, r, total, activo, elegible }) => (
                    <button key={clave} type="button" className={styles.caja} style={{ gridTemplateColumns: '120px minmax(0,1fr) 58px', cursor: elegible ? 'pointer' : 'default' }} aria-pressed={elegible ? activo : undefined} onClick={() => elegible && setLabCum(labCum === clave ? '' : clave)}>
                      <span className={styles.nom}>{nombre}<small>{plazo != null ? `plazo ${plazo} d háb. · ${nf.format(r.vencidas)} vencidas` : 'sin plazo cargado'}</small></span>
                      <span className={styles.apilada} role="img" aria-label={`${nombre}: ${r.cumplio} a tiempo, ${r.tarde + r.vencida} atrasadas, ${r.plazo + r.sinPlazo} sin juzgar`}>
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
                <span className={styles.sobre}>
                  ¿Y si el plazo fuera otro?
                  <Ayuda>Sirve para defender el plazo: si un día hábil más mueve mucho el %, el plazo está mal puesto o el proceso está al límite.</Ayuda>
                </span>
                <div className={styles.sens}>
                  {sens.map((s) => (
                    <div key={s.delta} className={s.delta === 0 ? styles.sensActual : undefined}>
                      <b>{s.pct == null ? '—' : `${Math.round(s.pct)} %`}</b>
                      <span>{s.delta === 0 ? 'plazos actuales' : `${s.delta > 0 ? '+' : '−'}${Math.abs(s.delta)} días háb. de plazo`}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        <p className={styles.formula}>
          <span><b>Cumplimiento</b> = a tiempo ÷ (a tiempo + tarde + vencidas sin entregar)</span>
          <span>{nf.format(cum.vencidas)} ya vencidas cuentan</span>
          <Ayuda etiqueta="Cómo se calcula el cumplimiento">
            <b>A tiempo:</b> llegó a «{textoFin}» dentro del plazo de su análisis (o el general de su laboratorio), en días hábiles desde la recepción estimada (emisión + {RECEPCION_ESTIMADA_DIAS} día).
            <br /><b>Entregada tarde:</b> llegó, pero después del plazo.
            <br /><b>Vencida sin entregar:</b> no llegó y ya pasó su plazo; cuenta como incumplida desde el día siguiente (si se entrega después, pasa a «tarde»).
            <br /><b>Aún en plazo:</b> {nf.format(cum.plazo)}, no cuentan todavía.
            {cum.sinPlazo > 0 && <><br /><b>Sin plazo:</b> {nf.format(cum.sinPlazo)}, su laboratorio y sus análisis no tienen plazo cargado.</>}
            {cum.excluidas > 0 && <><br /><b>Fuera:</b> {nf.format(cum.excluidas)} con una fecha anterior a la emisión.</>}
            <br />Solo mueven el número dos reglas: qué cuenta como «entregado» y el plazo de cada laboratorio o análisis, que fija el administrador general.
          </Ayuda>
        </p>

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
        </div>
      </details>
    </div>
  )
}
