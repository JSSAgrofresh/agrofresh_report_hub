import type { SolicitudAuditoria } from './tipos'

/**
 * Lead time y cumplimiento del entregable (Auditoría interna).
 *
 * Todo sale de los HITOS que el sistema ya guarda (ver `entrega_indicadores.py`).
 * Este archivo solo hace aritmética sobre ellos, sin tocar el navegador, para que
 * cada número se pueda explicar y probar: nada se estima ni se inventa.
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
  /** laboratorio en MAYÚSCULAS -> días */
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

export type ClaveTramo = 'envio' | 'laboratorio' | 'report' | 'cliente'

export const TRAMOS: { clave: ClaveTramo; nombre: string; desde: string; hasta: string }[] = [
  { clave: 'envio', nombre: 'Solicitud → envío al lab', desde: 'Solicitud emitida', hasta: 'Enviada al laboratorio' },
  { clave: 'laboratorio', nombre: 'Envío → informe del lab', desde: 'Enviada al laboratorio', hasta: 'Informe recibido' },
  { clave: 'report', nombre: 'Informe → Report', desde: 'Informe recibido', hasta: 'Resultados en Report' },
  { clave: 'cliente', nombre: 'Report → cliente', desde: 'Resultados en Report', hasta: 'Enviado al cliente' },
]

export const DIA_MS = 86_400_000

export const claveLaboratorio = (lab: string | null | undefined) => (lab ?? '').trim().toUpperCase()

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
  /** lead time en días corridos; null si sigue abierta o está excluida */
  dias: number | null
  /** días desde que se emitió hasta «ahora» */
  edad: number
  entregada: boolean
  plazo: number | null
  veredicto: Veredicto
  tramos: Partial<Record<ClaveTramo, number>>
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
  const edad = emitida == null ? 0 : Math.max(0, (ahora - emitida) / DIA_MS)
  const plazo = plazos[claveLaboratorio(sol.laboratorio)] ?? null
  const vacia = { sol, hitos: h, fin: null, dias: null, edad, entregada: false, plazo, tramos: {}, sinFechaReport: false }
  if (emitida == null) return { ...vacia, veredicto: 'excluida' }

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

  const tramos: Partial<Record<ClaveTramo, number>> = {}
  const dur = (a: number | null, b: number | null) => (a != null && b != null && b >= a ? (b - a) / DIA_MS : undefined)
  const t1 = dur(emitida, enviada)
  if (t1 !== undefined) tramos.envio = t1
  const t2 = dur(enviada, informe)
  if (t2 !== undefined) tramos.laboratorio = t2
  // Si los resultados ya estaban en Report antes de llegar el PDF, este tramo es 0, no negativo.
  const t3 = informe != null && report != null ? Math.max(0, (report - informe) / DIA_MS) : undefined
  if (t3 !== undefined) tramos.report = t3
  if (def === 'cliente') {
    const t4 = dur(report ?? informe, cliente)
    if (t4 !== undefined) tramos.cliente = t4
  }

  const dias = fin != null ? (fin - emitida) / DIA_MS : null
  return {
    sol, hitos: h, fin, dias, edad, entregada, plazo, tramos,
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

export interface CajaLab {
  lab: string
  n: number
  p10: number
  p25: number
  p50: number
  p75: number
  p90: number
  plazo: number | null
}

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

function caja(lab: string, d: number[], plazo: number | null): CajaLab {
  return {
    lab, n: d.length, plazo,
    p10: percentil(d, 0.1) as number, p25: percentil(d, 0.25) as number, p50: percentil(d, 0.5) as number,
    p75: percentil(d, 0.75) as number, p90: percentil(d, 0.9) as number,
  }
}

const diasEntregadas = (ev: EvaluadaEntrega[]) => ev.filter((e) => e.entregada && e.dias != null).map((e) => e.dias as number)

/** La caja de todas las entregadas juntas (lab vacío), o null si no hay ninguna. */
export function cajaTodos(ev: EvaluadaEntrega[]): CajaLab | null {
  const d = diasEntregadas(ev)
  return d.length ? caja('', d, null) : null
}

/** Una caja por laboratorio (con al menos una entregada), de más a menos solicitudes. */
export function cajasPorLaboratorio(ev: EvaluadaEntrega[], plazos: Record<string, number>): CajaLab[] {
  const por = new Map<string, number[]>()
  for (const e of ev) {
    if (!e.entregada || e.dias == null) continue
    const lab = claveLaboratorio(e.sol.laboratorio) || 'SIN LABORATORIO'
    por.set(lab, [...(por.get(lab) ?? []), e.dias])
  }
  return [...por.entries()]
    .map(([lab, d]) => caja(lab, d, plazos[lab] ?? null))
    .sort((a, b) => b.n - a.n || a.lab.localeCompare(b.lab))
}

export interface TramoResumen {
  clave: ClaveTramo
  nombre: string
  valor: number
  /** solicitudes que tienen este tramo completo */
  n: number
}

/** El tiempo de cada tramo (mediana o P90) de las entregadas, de un laboratorio o de todos. */
export function desgloseTramos(
  ev: EvaluadaEntrega[], def: Definicion, p: 0.5 | 0.9, lab?: string,
): TramoResumen[] {
  const entregadas = ev.filter((e) => e.entregada && e.dias != null && (!lab || claveLaboratorio(e.sol.laboratorio) === lab))
  return TRAMOS.filter((t) => def === 'cliente' || t.clave !== 'cliente').map((t) => {
    const v = entregadas.map((e) => e.tramos[t.clave]).filter((x): x is number => x != null)
    return { clave: t.clave, nombre: t.nombre, valor: percentil(v, p) ?? 0, n: v.length }
  })
}

export function cuelloDeBotella(tr: TramoResumen[]): { tramo: TramoResumen; pct: number } | null {
  const con = tr.filter((t) => t.n > 0)
  if (con.length === 0) return null
  const total = con.reduce((s, t) => s + t.valor, 0)
  const tramo = con.reduce((m, t) => (t.valor > m.valor ? t : m), con[0])
  return { tramo, pct: total ? (tramo.valor / total) * 100 : 0 }
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
