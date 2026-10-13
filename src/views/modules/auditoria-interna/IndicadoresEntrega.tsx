import { useCallback, useMemo, useState } from 'react'
import {
  claveLaboratorio,
  RECEPCION_ESTIMADA_DIAS,
  evaluarTodas,
  resumenCumplimiento,
  resumenLeadTime,
  seriePorMes,
  useEntrega,
} from '@/features/auditoriaInterna'
import type { Definicion, EvaluadaEntrega, PuntoMes, SolicitudAuditoria, Veredicto } from '@/features/auditoriaInterna'
import { formatDateCL } from '@/lib/locale'
import { ConfiguracionEntrega } from './ConfiguracionEntrega'
import { CumplimientoEntregable } from './CumplimientoEntregable'
import { FlujogramaLeadTime } from './FlujogramaLeadTime'
import styles from './IndicadoresEntrega.module.css'

const nf = new Intl.NumberFormat('es-CL')
const f1 = (v: number | null | undefined) =>
  v == null || Number.isNaN(v) ? '—' : v.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

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
export function IndicadoresEntrega({ solicitudes, puedeEditar = false }: { solicitudes: SolicitudAuditoria[]; puedeEditar?: boolean }) {
  const { hitos, reglas, error, guardar } = useEntrega()
  const [configAbierta, setConfigAbierta] = useState(false)
  const cerrarConfig = useCallback(() => setConfigAbierta(false), [])
  const [ahora] = useState(() => Date.now())
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
  // Los Análisis (FSMA, residuos en fruta, patógenos…) que se han pedido a cada laboratorio: cada uno puede tener su propio plazo.
  const analisisPorLab = useMemo(() => {
    const por = new Map<string, Set<string>>()
    solicitudes.forEach((x) => {
      const lab = claveLaboratorio(x.laboratorio)
      if (!lab) return
      const set = por.get(lab) ?? new Set<string>()
      ;(x.analisis ?? []).forEach((a) => { if (a.trim()) set.add(a.trim().toUpperCase()) })
      por.set(lab, set)
    })
    Object.keys(reglas?.plazos ?? {}).forEach((k) => {
      const [lab, analito] = k.split('|')
      if (analito) por.set(lab, (por.get(lab) ?? new Set<string>()).add(analito))
    })
    return new Map([...por.entries()].map(([lab, set]) => [lab, [...set].sort()]))
  }, [solicitudes, reglas])
  // Lo que se calcula: lo guardado en la configuración (ya no se edita desde esta pantalla).
  const definicion: Definicion = reglas?.entregado ?? 'concretado'
  const plazos = useMemo(() => reglas?.plazos ?? {}, [reglas])

  const ev = useMemo(
    () => (hitos ? evaluarTodas(solicitudes, hitos, definicion, plazos, ahora) : []),
    [solicitudes, hitos, definicion, plazos, ahora],
  )
  const hayPlazos = Object.keys(plazos).length > 0

  const lead = useMemo(() => resumenLeadTime(ev), [ev])
  const evFlujo = useMemo(() => (labElegido ? ev.filter((e) => claveLaboratorio(e.sol.laboratorio) === labElegido) : ev), [ev, labElegido])
  const serie = useMemo(() => seriePorMes(ev), [ev])
  const cum = useMemo(() => resumenCumplimiento(ev), [ev])

  if (error) {
    return <p className={styles.error} role="alert">{error}</p>
  }
  if (!hitos || !reglas) {
    return <p className={styles.cargando} aria-busy="true">Calculando lead time y cumplimiento…</p>
  }

  const textoFin = definicion === 'cliente' ? 'Enviado al cliente' : 'PDF + resultados en Report'

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
      {/* ───────── Lead time ───────── */}
      <section className={styles.tarjeta} aria-labelledby="ie-lead">
        <header className={styles.cabecera}>
          <div>
            <span className={styles.sobre}>Indicador</span>
            <h3 id="ie-lead">Lead time: de la recepción estimada a lo entregado</h3>
          </div>
        </header>

        {lead.entregadas === 0 ? (
          <p className={styles.vacio}>Todavía no hay informes entregados con estos filtros ({nf.format(lead.abiertas)} siguen pendientes).</p>
        ) : (
          <>
            <div className={styles.tiles}>
              <div className={styles.tile}>
                <span className={styles.et}>Lead time mediano</span>
                <span className={styles.gr}>{f1(lead.p50)}<small>días háb.</small></span>
                <span className={styles.ap}>
                  la mitad tarda menos
                  <Ayuda>
                    <b>Se usa la mediana y no el promedio</b> porque unos pocos informes muy atrasados inflan el promedio. Aquí el promedio sería {f1(lead.promedio)} d contra una mediana de {f1(lead.p50)} d.
                  </Ayuda>
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
                  <Ayuda>No entran al cálculo: un informe pendiente todavía no tiene lead time. Dejarlo fuera haría que el número se vea mejor de lo que es, por eso se informa aparte.</Ayuda>
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
          <span>{nf.format(lead.entregadas)} de {nf.format(lead.total)} informes entran al cálculo</span>
          <Ayuda etiqueta="Cómo se calcula el lead time">
            <b>Qué entra.</b> {nf.format(lead.total)} informes del alcance (uno por solicitud; filtros de la página, sin pruebas): {nf.format(lead.entregadas)} ya llegaron a «{textoFin}» y {nf.format(lead.abiertas)} siguen pendientes
            {lead.excluidas > 0 ? `; ${nf.format(lead.excluidas)} quedan fuera por tener una fecha anterior a la emisión` : ''}.
            <br />
            <b>De dónde sale cada fecha.</b> Emisión: cuándo se creó la solicitud; la recepción en el laboratorio se estima {RECEPCION_ESTIMADA_DIAS} día después (no la conocemos).
            Informe: la «fecha de envío» anotada al subir el PDF o, si no, cuando se subió{lead.entregadas ? ` (${nf.format(lead.conFechaAnotada)} de ${nf.format(lead.entregadas)} tienen fecha anotada)` : ''}.
            Report: cuándo se hizo la carga de datos{lead.sinFechaReport ? `; en ${nf.format(lead.sinFechaReport)} no hay fecha de carga y se usó la del informe` : ''}.
            {definicion === 'cliente' && ' Cliente: la fecha del check «enviado al cliente» marcado a mano.'}
          </Ayuda>
        </p>

        <details className={styles.como}>
          <summary>Ver los informes que hay detrás <span className={styles.chip}>{nf.format(filasLead.length)}</span></summary>
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
          <div className={styles.cabAcciones}>
            <small>qué parte llegó dentro del plazo prometido, dónde falla y cómo evoluciona</small>
            {puedeEditar && (
              <button type="button" className={styles.botonConfig} onClick={() => setConfigAbierta(true)}>
                ⚙ Pasos de la entrega
              </button>
            )}
          </div>
        </header>
        {puedeEditar && configAbierta && (
          <ConfiguracionEntrega reglas={reglas} labs={labs} analisisPorLab={analisisPorLab} guardar={guardar} onCerrar={cerrarConfig} />
        )}

        {!hayPlazos ? (
          <p className={styles.vacio}>
            Para calcular el cumplimiento hace falta el plazo de cada laboratorio o análisis. Pídele al administrador general que los cargue.
            {' '}No se asume ninguno.
          </p>
        ) : (
          <CumplimientoEntregable ev={ev} serie={serie} textoFin={textoFin} labElegido={labCum} onLab={setLabCum} />
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
          <summary>Ver los informes que hay detrás <span className={styles.chip}>{nf.format(filasCum.length)}</span></summary>
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
