import type { SolicitudAuditoria } from './tipos'

/**
 * Lead time y cumplimiento del entregable (Auditoría interna).
 *
 * Todo sale de los HITOS que el sistema ya guarda (ver `entrega_indicadores.py`).
 * Este archivo solo hace aritmética sobre ellos, sin tocar el navegador, para que
 * cada número se pueda explicar y probar.
 *
 * ÚNICO SUPUESTO: no sabemos cuándo el laboratorio pasa a retirar las muestras, así que
 * la recepción en el laboratorio se ESTIMA 24 horas después de emitida la solicitud
 * (`RECEPCION_ESTIMADA_DIAS`). Desde ahí corren los tiempos, en DÍAS HÁBILES (lunes a
 * viernes, sin feriados). Todo cálculo de este archivo está sujeto a ese supuesto.
 */

export type Definicion = 'concretado' | 'cliente'

/** Las fechas de cada hito de una solicitud (ISO), o null si todavía no ocurrió o no se registró. */
export interface Hitos {
  archivo: string
  emitida: string | null
  enviada: string | null
  informe: string | null
  /** `fecha_envio` = la anotó una persona al subir el PDF; `carga` = el momento en que se subió. */
  informe_fuente: 'fecha_envio' | 'carga' | null
  report: string | null
  en_report: boolean
  cliente: string | null
  /** primera vez que un cliente vio sus resultados en Report (null = nadie, o falta la migración 0057) */
  observado?: string | null
  /** qué clientes los vieron («DOLE · LONTUE») */
  observado_por?: string[]
}

export interface CalidadEntrega {
  envios_a_clientes: number | null
  /** null = falta la migración 0054 */
  envios_amarrados: number | null
}

export interface RespuestaHitos {
  hitos: Hitos[]
  calidad: CalidadEntrega
}

export interface ReglasEntrega {
  entregado: Definicion
  /** «LAB» o «LAB|ANALITO» (mayúsculas) -> días hábiles */
  plazos: Record<string, number>
  cambiado_por: string | null
  cambiado_en: string | null
}

export type Veredicto =
  /** entregada dentro del plazo */
  | 'cumplio'
  /** entregada, pero pasado el plazo */
  | 'tarde'
  /** sin entregar y ya pasó el plazo */
  | 'vencida'
  /** sin entregar, el plazo aún corre: no se juzga */
  | 'plazo'
  /** su laboratorio no tiene plazo cargado */
  | 'sin_plazo'
  /** fechas que no cuadran (un hito anterior a la emisión): no se usa */
  | 'excluida'

/** La recepción en el laboratorio se estima un día después de emitida la solicitud. */
export const RECEPCION_ESTIMADA_DIAS = 1

export const DIA_MS = 86_400_000

export const claveLaboratorio = (lab: string | null | undefined) => (lab ?? '').trim().toUpperCase()

/** Clave de un plazo por análisis: «LAB|ANALITO». */
export const clavePlazoAnalisis = (lab: string | null | undefined, analito: string) =>
  `${claveLaboratorio(lab)}|${analito.trim().toUpperCase()}`

/** Días hábiles (lunes a viernes, sin feriados) entre dos momentos, con fracción: 12 horas
 * de un martes son 0,5. Un fin de semana no suma. */
export function diasHabiles(desde: number, hasta: number): number {
  if (!(hasta > desde)) return 0
  let total = 0
  let t = desde
  while (t < hasta) {
    const d = new Date(t)
    const inicio = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
    const fin = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime()
    const corte = Math.min(fin, hasta)
    if (d.getDay() !== 0 && d.getDay() !== 6) total += (corte - t) / (fin - inicio)
    t = corte
  }
  return total
}

/** El plazo que rige a una solicitud, en días hábiles. Cada análisis pedido usa el suyo
 * si lo tiene y, si no, el general de su laboratorio; manda el más lento de todos (la
 * solicitud no está lista hasta que lo esté su análisis más demorado). `analisis` dice cuál
 * fijó el plazo, o null si fue el general del laboratorio. Sin ningún plazo cargado: null. */
export function plazoDe(sol: SolicitudAuditoria, plazos: Record<string, number>): { dias: number | null; analisis: string | null } {
  const general = plazos[claveLaboratorio(sol.laboratorio)] ?? null
  let dias: number | null = null
  let analisis: string | null = null
  for (const a of sol.analitos ?? []) {
    const propio = plazos[clavePlazoAnalisis(sol.laboratorio, a)]
    const v = propio ?? general
    if (v == null) continue
    if (dias == null || v > dias) {
      dias = v
      analisis = propio != null ? a.trim().toUpperCase() : null
    }
  }
  return dias != null ? { dias, analisis } : { dias: general, analisis: null }
}

const ms = (iso: string | null | undefined): number | null => {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : t
}

export interface EvaluadaEntrega {
  sol: SolicitudAuditoria
  hitos: Hitos | null
  /** momento en que quedó entregada según la definición vigente */
  fin: number | null
  /** lead time en días hábiles desde la recepción estimada; null si sigue abierta o está excluida */
  dias: number | null
  /** días hábiles desde la recepción estimada hasta «ahora» */
  edad: number
  /** recepción estimada en el laboratorio (emisión + 1 día) */
  recepcion: number | null
  /** ¿ya pasó la recepción estimada? */
  recibida: boolean
  entregada: boolean
  /** plazo en días hábiles que rige a esta solicitud */
  plazo: number | null
  /** el análisis que fijó ese plazo (null = el general del laboratorio) */
  analisis: string | null
  veredicto: Veredicto
  /** «concretado»: tiene resultados en Report pero sin la fecha de su carga (cargas anteriores a la 0042) */
  sinFechaReport: boolean
}

/** El veredicto no depende de nada más que de estos cuatro datos: así se puede
 * recalcular con otro plazo (la sensibilidad) sin repetir el resto. */
export function veredictoDe(entregada: boolean, dias: number | null, edad: number, plazo: number | null): Veredicto {
  if (plazo == null) return 'sin_plazo'
  if (entregada) return (dias ?? 0) <= plazo ? 'cumplio' : 'tarde'
  return edad > plazo ? 'vencida' : 'plazo'
}

export function evaluar(
  sol: SolicitudAuditoria,
  h: Hitos | null,
  def: Definicion,
  plazos: Record<string, number>,
  ahora: number,
): EvaluadaEntrega {
  const emitida = ms(sol.emitida_en)
  const recepcion = emitida == null ? null : emitida + RECEPCION_ESTIMADA_DIAS * DIA_MS
  const edad = recepcion == null ? 0 : diasHabiles(recepcion, ahora)
  const { dias: plazo, analisis } = plazoDe(sol, plazos)
  const vacia = {
    sol, hitos: h, fin: null, dias: null, edad, recepcion, recibida: recepcion != null && ahora >= recepcion,
    entregada: false, plazo, analisis, sinFechaReport: false,
  }
  if (emitida == null || recepcion == null) return { ...vacia, veredicto: 'excluida' }

  const enviada = ms(h?.enviada)
  const informe = ms(h?.informe)
  const report = ms(h?.report)
  const cliente = ms(h?.cliente)

  const concretada = sol.concretada
  const entregada = def === 'cliente' ? cliente != null : concretada && informe != null
  let fin: number | null = null
  if (entregada) fin = def === 'cliente' ? cliente : Math.max(informe as number, report ?? (informe as number))

  // Un hito anterior a la emisión no cuadra (por ejemplo, resultados cargados antes
  // de emitir la OT): esa solicitud no se mide, pero se cuenta como excluida.
  const incoherente = [enviada, informe, report, cliente].some((t) => t != null && t < emitida)
  if (incoherente) return { ...vacia, veredicto: 'excluida' }

  // Si el informe llegó antes de la recepción estimada, el tiempo es 0, no negativo.
  const dias = fin != null ? diasHabiles(recepcion, fin) : null
  return {
    sol, hitos: h, fin, dias, edad, recepcion, recibida: ahora >= recepcion, entregada, plazo, analisis,
    veredicto: veredictoDe(entregada, dias, edad, plazo),
    sinFechaReport: def === 'concretado' && entregada && report == null,
  }
}

export function evaluarTodas(
  solicitudes: SolicitudAuditoria[],
  hitos: Map<string, Hitos>,
  def: Definicion,
  plazos: Record<string, number>,
  ahora: number,
): EvaluadaEntrega[] {
  return solicitudes.map((s) => evaluar(s, hitos.get(s.archivo) ?? null, def, plazos, ahora))
}

// ── estadística ──────────────────────────────────────────────────────────

/** Percentil por interpolación lineal (p entre 0 y 1). Sin datos, null. */
export function percentil(valores: number[], p: number): number | null {
  if (valores.length === 0) return null
  const v = [...valores].sort((a, b) => a - b)
  const i = (v.length - 1) * p
  const lo = Math.floor(i)
  const hi = Math.ceil(i)
  return v[lo] + (v[hi] - v[lo]) * (i - lo)
}

export const promedio = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null)

// ── lead time ────────────────────────────────────────────────────────────

export interface ResumenLeadTime {
  /** solicitudes del alcance */
  total: number
  /** ya entregadas: entran al cálculo */
  entregadas: number
  /** siguen abiertas: quedan fuera y se informan aparte */
  abiertas: number
  /** con fechas que no cuadran: quedan fuera */
  excluidas: number
  edadMedianaAbiertas: number | null
  p50: number | null
  p90: number | null
  promedio: number | null
  /** entregadas cuya fecha de Report no existe (se usó la del informe) */
  sinFechaReport: number
  /** entregadas cuya fecha de informe la anotó una persona */
  conFechaAnotada: number
}

export function resumenLeadTime(ev: EvaluadaEntrega[]): ResumenLeadTime {
  const ok = ev.filter((e) => e.veredicto !== 'excluida')
  const entregadas = ok.filter((e) => e.entregada && e.dias != null)
  const abiertas = ok.filter((e) => !e.entregada)
  const dias = entregadas.map((e) => e.dias as number)
  return {
    total: ev.length,
    entregadas: entregadas.length,
    abiertas: abiertas.length,
    excluidas: ev.length - ok.length,
    edadMedianaAbiertas: percentil(abiertas.map((e) => e.edad), 0.5),
    p50: percentil(dias, 0.5),
    p90: percentil(dias, 0.9),
    promedio: promedio(dias),
    sinFechaReport: entregadas.filter((e) => e.sinFechaReport).length,
    conFechaAnotada: entregadas.filter((e) => e.hitos?.informe_fuente === 'fecha_envio').length,
  }
}

// ── cumplimiento ─────────────────────────────────────────────────────────

export interface ResumenCumplimiento {
  cumplio: number
  tarde: number
  vencida: number
  plazo: number
  sinPlazo: number
  excluidas: number
  /** las que ya debían estar entregadas: cumplio + tarde + vencida */
  vencidas: number
  /** 0-100; null si ninguna ha vencido o no hay plazos */
  pct: number | null
}

export function resumenCumplimiento(ev: EvaluadaEntrega[]): ResumenCumplimiento {
  const c = { cumplio: 0, tarde: 0, vencida: 0, plazo: 0, sin_plazo: 0, excluida: 0 }
  for (const e of ev) c[e.veredicto] += 1
  const vencidas = c.cumplio + c.tarde + c.vencida
  return {
    cumplio: c.cumplio, tarde: c.tarde, vencida: c.vencida, plazo: c.plazo,
    sinPlazo: c.sin_plazo, excluidas: c.excluida, vencidas,
    pct: vencidas ? (c.cumplio / vencidas) * 100 : null,
  }
}

export function cumplimientoPorLab(ev: EvaluadaEntrega[]): { lab: string; plazo: number | null; r: ResumenCumplimiento; total: number }[] {
  const por = new Map<string, EvaluadaEntrega[]>()
  for (const e of ev) {
    const lab = claveLaboratorio(e.sol.laboratorio) || 'SIN LABORATORIO'
    por.set(lab, [...(por.get(lab) ?? []), e])
  }
  return [...por.entries()]
    .map(([lab, lista]) => ({ lab, plazo: lista[0].plazo, r: resumenCumplimiento(lista), total: lista.length }))
    .sort((a, b) => b.total - a.total || a.lab.localeCompare(b.lab))
}

export interface CumplimientoAnalisis {
  /** «LAB · ANALITO», o «LAB · plazo general» si rige el plazo general del laboratorio */
  etiqueta: string
  lab: string
  analisis: string | null
  plazo: number | null
  r: ResumenCumplimiento
  total: number
}

/** El cumplimiento agrupado por el análisis que fija el plazo de cada solicitud. */
export function cumplimientoPorAnalisis(ev: EvaluadaEntrega[]): CumplimientoAnalisis[] {
  const por = new Map<string, EvaluadaEntrega[]>()
  for (const e of ev) {
    const lab = claveLaboratorio(e.sol.laboratorio) || 'SIN LABORATORIO'
    const clave = `${lab}|${e.analisis ?? ''}`
    por.set(clave, [...(por.get(clave) ?? []), e])
  }
  return [...por.entries()]
    .map(([clave, lista]) => {
      const [lab, analisis] = clave.split('|')
      return {
        etiqueta: `${lab} · ${analisis || 'plazo general'}`, lab, analisis: analisis || null,
        plazo: lista[0].plazo, r: resumenCumplimiento(lista), total: lista.length,
      }
    })
    .sort((a, b) => b.total - a.total || a.etiqueta.localeCompare(b.etiqueta))
}

/** ¿Qué pasaría con el cumplimiento si cada plazo fuera `delta` días mayor (o menor)? */
export function sensibilidad(ev: EvaluadaEntrega[], deltas: number[]): { delta: number; pct: number | null }[] {
  return deltas.map((delta) => {
    const re = ev.map((e) => {
      if (e.veredicto === 'excluida' || e.plazo == null) return e
      return { ...e, veredicto: veredictoDe(e.entregada, e.dias, e.edad, Math.max(1, e.plazo + delta)) }
    })
    return { delta, pct: resumenCumplimiento(re).pct }
  })
}

// ── series por mes ───────────────────────────────────────────────────────

export interface PuntoMes {
  mes: string
  /** mediana del lead time de lo emitido ese mes (null si hay menos de 3 entregadas) */
  p50: number | null
  /** cumplimiento de lo emitido ese mes (null si hay menos de 3 vencidas) */
  pct: number | null
  n: number
}

/** Por mes de EMISIÓN de la solicitud (una cohorte): así un mes no se mueve cuando
 * después llegan sus informes atrasados... salvo que esos informes lleguen, que es lo correcto. */
export function seriePorMes(ev: EvaluadaEntrega[], maximo = 6): PuntoMes[] {
  const por = new Map<string, EvaluadaEntrega[]>()
  for (const e of ev) {
    const mes = (e.sol.emitida_en ?? '').slice(0, 7)
    if (!/^\d{4}-\d{2}$/.test(mes)) continue
    por.set(mes, [...(por.get(mes) ?? []), e])
  }
  return [...por.keys()].sort().slice(-maximo).map((mes) => {
    const lista = por.get(mes) as EvaluadaEntrega[]
    const r = resumenLeadTime(lista)
    const c = resumenCumplimiento(lista)
    return { mes, n: lista.length, p50: r.entregadas >= 3 ? r.p50 : null, pct: c.vencidas >= 3 ? c.pct : null }
  })
}

// ── flujograma ───────────────────────────────────────────────────────────

/** Los puntos del flujograma, de arriba hacia abajo. `cliente` e `informe_sistema` van al
 * mismo nivel (no uno después del otro). */
export type NodoFlujo = 'emitida' | 'recepcion' | 'analisis' | 'informe' | 'cliente' | 'sistema' | 'observado'

/** Qué puntos ya alcanzó una solicitud. Un punto se activa cuando se cumple su hito. */
export function alcanzados(e: EvaluadaEntrega): Record<NodoFlujo, boolean> {
  const h = e.hitos
  return {
    emitida: true,
    recepcion: e.recibida,
    analisis: e.recibida,
    informe: h?.informe != null,
    cliente: h?.cliente != null,
    sistema: Boolean(e.sol.en_report) || h?.report != null,
    // Disponible para el cliente: ya está en Report (aunque nadie lo haya abierto todavía) o un cliente ya lo vio.
    observado: Boolean(e.sol.en_report) || h?.report != null || Boolean(h?.observado),
  }
}

/** El último punto de la cadena principal que alcanzó: dónde está hoy. */
export function nodoActual(e: EvaluadaEntrega): NodoFlujo {
  const a = alcanzados(e)
  if (a.observado) return 'observado'
  if (a.cliente || a.sistema) return a.cliente && !a.sistema ? 'cliente' : 'sistema'
  if (a.informe) return 'informe'
  if (a.analisis) return 'analisis'
  if (a.recepcion) return 'recepcion'
  return 'emitida'
}

export interface ResumenNodo {
  nodo: NodoFlujo
  /** cuántas solicitudes ya llegaron a este punto */
  alcanzaron: number
  /** cuántas están hoy justo en este punto */
  ahoraAqui: number
}

/** Cuántas solicitudes pasaron por cada punto y cuántas están hoy en él (sin las excluidas). */
export function resumenFlujo(ev: EvaluadaEntrega[]): Record<NodoFlujo, ResumenNodo> {
  const nodos: NodoFlujo[] = ['emitida', 'recepcion', 'analisis', 'informe', 'cliente', 'sistema', 'observado']
  const salida = Object.fromEntries(nodos.map((n) => [n, { nodo: n, alcanzaron: 0, ahoraAqui: 0 }])) as Record<NodoFlujo, ResumenNodo>
  for (const e of ev) {
    if (e.veredicto === 'excluida') continue
    const a = alcanzados(e)
    nodos.forEach((n) => { if (a[n]) salida[n].alcanzaron += 1 })
    salida[nodoActual(e)].ahoraAqui += 1
  }
  return salida
}
