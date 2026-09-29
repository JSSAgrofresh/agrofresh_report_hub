import type { EstadoSolicitud, SolicitudAuditoria } from './tipos'

export function estadoDe(s: SolicitudAuditoria): EstadoSolicitud {
  if (s.concretada) return 'concretada'
  // Tiene su PDF, pero los resultados todavía no se ven en Report (por
  // ejemplo, quedaron en Pendientes de revisión de DataCore).
  if (s.informe) return 'sin_report'
  return 'pendiente'
}

export interface Totales {
  emitidas: number
  concretadas: number
  sinReport: number
  pendientes: number
  /** 0-100; 0 si no hay solicitudes */
  porcentajeConcretado: number
  /** días promedio entre emitir y cargar el informe; null si ninguna tiene informe */
  demoraPromedioDias: number | null
}

export function totales(solicitudes: SolicitudAuditoria[]): Totales {
  const t = { emitidas: solicitudes.length, concretadas: 0, sinReport: 0, pendientes: 0 }
  for (const s of solicitudes) {
    const e = estadoDe(s)
    if (e === 'concretada') t.concretadas++
    else if (e === 'sin_report') t.sinReport++
    else t.pendientes++
  }
  const demoras = solicitudes.map(demoraDias).filter((d): d is number => d !== null)
  return {
    ...t,
    porcentajeConcretado: t.emitidas ? (t.concretadas / t.emitidas) * 100 : 0,
    demoraPromedioDias: demoras.length ? demoras.reduce((a, b) => a + b, 0) / demoras.length : null,
  }
}

/** Días enteros entre el día de emisión y el día de carga del informe. null si
 * falta alguna de las dos fechas. Nunca negativo: una carga "anterior" a la
 * emisión es un desfase de reloj, no una demora. */
export function demoraDias(s: SolicitudAuditoria): number | null {
  const emitida = soloDia(s.emitida_en) ?? soloDia(s.fecha_solicitud)
  const cargada = soloDia(s.informe?.cargado_en ?? null)
  if (!emitida || !cargada) return null
  const [a1, m1, d1] = emitida.split('-').map(Number)
  const [a2, m2, d2] = cargada.split('-').map(Number)
  const dias = Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / DIA_MS)
  return Math.max(0, dias)
}

/** La fecha (YYYY-MM-DD) de una marca ISO, sin convertir de zona: es el día
 * que quedó escrito, que es lo que interesa para agrupar por semana. */
function soloDia(iso: string | null): string | null {
  const m = (iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

const DIA_MS = 24 * 60 * 60 * 1000

function lunesDe(dia: string): number {
  const [a, m, d] = dia.split('-').map(Number)
  const t = Date.UTC(a, m - 1, d)
  const diaSemana = (new Date(t).getUTCDay() + 6) % 7 // lunes = 0
  return t - diaSemana * DIA_MS
}

/** Semana ISO (1-53) del lunes dado. */
function semanaIso(lunes: number): number {
  const jueves = new Date(lunes + 3 * DIA_MS)
  const inicioAnio = Date.UTC(jueves.getUTCFullYear(), 0, 1)
  return Math.floor((jueves.getTime() - inicioAnio) / (7 * DIA_MS)) + 1
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

export interface PuntoSemana {
  /** lunes de la semana, YYYY-MM-DD */
  inicio: string
  etiqueta: string
  /** total emitidas = concretadas + sinReport + pendientes */
  emitidas: number
  concretadas: number
  sinReport: number
  pendientes: number
}

/** Solicitudes emitidas por semana (según cuándo se emitieron), y cuántas de
 * ellas ya se concretaron. Las semanas sin ninguna quedan en cero para que el
 * gráfico no salte. Se devuelven las últimas `maxSemanas`. */
export function porSemana(solicitudes: SolicitudAuditoria[], maxSemanas = 26): PuntoSemana[] {
  type Cuenta = Omit<PuntoSemana, 'inicio' | 'etiqueta'>
  const nueva = (): Cuenta => ({ emitidas: 0, concretadas: 0, sinReport: 0, pendientes: 0 })
  const cuenta = new Map<number, Cuenta>()
  for (const s of solicitudes) {
    const dia = soloDia(s.emitida_en) ?? soloDia(s.fecha_solicitud)
    if (!dia) continue
    const lunes = lunesDe(dia)
    const c = cuenta.get(lunes) ?? nueva()
    sumar(c, s)
    cuenta.set(lunes, c)
  }
  if (cuenta.size === 0) return []
  const lunes = [...cuenta.keys()]
  const primero = Math.max(Math.min(...lunes), Math.max(...lunes) - (maxSemanas - 1) * 7 * DIA_MS)
  const ultimo = Math.max(...lunes)
  const puntos: PuntoSemana[] = []
  for (let t = primero; t <= ultimo; t += 7 * DIA_MS) {
    const f = new Date(t)
    const c = cuenta.get(t) ?? nueva()
    puntos.push({
      inicio: f.toISOString().slice(0, 10),
      etiqueta: `S${semanaIso(t)} · ${f.getUTCDate()} ${MESES[f.getUTCMonth()]}`,
      ...c,
    })
  }
  return puntos
}

interface ConteoEstados {
  emitidas: number
  concretadas: number
  sinReport: number
  pendientes: number
}

function sumar(c: ConteoEstados, s: SolicitudAuditoria) {
  c.emitidas++
  const e = estadoDe(s)
  if (e === 'concretada') c.concretadas++
  else if (e === 'sin_report') c.sinReport++
  else c.pendientes++
}

export interface ClienteTop {
  cliente: string
  /** total de solicitudes = concretadas + sinReport + pendientes */
  solicitudes: number
  concretadas: number
  sinReport: number
  pendientes: number
}

export const SIN_CLIENTE = 'Sin cliente'

export function topClientes(solicitudes: SolicitudAuditoria[], n = 10): ClienteTop[] {
  const por = new Map<string, ClienteTop>()
  for (const s of solicitudes) {
    const cliente = (s.sold_to ?? '').trim() || SIN_CLIENTE
    const c = por.get(cliente) ?? { cliente, solicitudes: 0, concretadas: 0, sinReport: 0, pendientes: 0 }
    const conteo = { emitidas: c.solicitudes, concretadas: c.concretadas, sinReport: c.sinReport, pendientes: c.pendientes }
    sumar(conteo, s)
    por.set(cliente, { cliente, solicitudes: conteo.emitidas, concretadas: conteo.concretadas, sinReport: conteo.sinReport, pendientes: conteo.pendientes })
  }
  return [...por.values()]
    .sort((a, b) => b.solicitudes - a.solicitudes || a.cliente.localeCompare(b.cliente, 'es'))
    .slice(0, n)
}

export type CampoOrden = 'numero' | 'laboratorio' | 'cliente' | 'planta' | 'emitida' | 'cargada' | 'enviada' | 'estado' | 'demora'
export type Sentido = 'asc' | 'desc'

const PESO_ESTADO: Record<EstadoSolicitud, number> = { concretada: 0, sin_report: 1, pendiente: 2 }

function valorDe(s: SolicitudAuditoria, campo: CampoOrden): string | number | null {
  switch (campo) {
    case 'numero': return s.numero_solicitud
    case 'laboratorio': return s.laboratorio
    case 'cliente': return s.sold_to
    case 'planta': return s.ship_to
    case 'emitida': return s.emitida_en ?? s.fecha_solicitud
    case 'cargada': return s.informe?.cargado_en ?? null
    case 'enviada': return s.informe?.fecha_envio ?? null
    case 'estado': return PESO_ESTADO[estadoDe(s)]
    case 'demora': return demoraDias(s)
  }
}

/** Ordena sin mutar. Los vacíos van SIEMPRE al final, en cualquier sentido:
 * un "sin fecha" nunca debe quedar arriba de la lista por ordenar de menor a mayor. */
export function ordenarSolicitudes(
  solicitudes: SolicitudAuditoria[],
  campo: CampoOrden,
  sentido: Sentido,
): SolicitudAuditoria[] {
  const signo = sentido === 'asc' ? 1 : -1
  return [...solicitudes].sort((a, b) => {
    const x = valorDe(a, campo)
    const y = valorDe(b, campo)
    if (x === null || x === '') return y === null || y === '' ? 0 : 1
    if (y === null || y === '') return -1
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * signo
    return String(x).localeCompare(String(y), 'es', { numeric: true }) * signo
  })
}

const ETIQUETA_ESTADO_CSV: Record<EstadoSolicitud, string> = {
  concretada: 'Concretada',
  sin_report: 'PDF sin Report',
  pendiente: 'Pendiente',
}

/** CSV para Excel en español (separador ";", BOM UTF-8), con las mismas columnas de la tabla. */
export function solicitudesACsv(solicitudes: SolicitudAuditoria[]): string {
  const celda = (v: string | number | null | undefined) => {
    const t = v === null || v === undefined ? '' : String(v)
    return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
  }
  const filas = [
    ['Solicitud', 'Laboratorio', 'Cliente', 'Planta', 'Emitida', 'Cargada', 'Enviada', 'Demora (días)', 'Estado', 'N° informe', 'Archivo'],
    ...solicitudes.map((s) => [
      s.numero_solicitud, s.laboratorio, s.sold_to, s.ship_to,
      s.emitida_en ?? s.fecha_solicitud, s.informe?.cargado_en, s.informe?.fecha_envio,
      demoraDias(s), ETIQUETA_ESTADO_CSV[estadoDe(s)], s.informe?.nro_informe, s.informe?.nombre_archivo,
    ]),
  ]
  return '\uFEFF' + filas.map((f) => f.map(celda).join(';')).join('\r\n')
}
