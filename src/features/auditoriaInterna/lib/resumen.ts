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
}

export function totales(solicitudes: SolicitudAuditoria[]): Totales {
  const t = { emitidas: solicitudes.length, concretadas: 0, sinReport: 0, pendientes: 0 }
  for (const s of solicitudes) {
    const e = estadoDe(s)
    if (e === 'concretada') t.concretadas++
    else if (e === 'sin_report') t.sinReport++
    else t.pendientes++
  }
  return {
    ...t,
    porcentajeConcretado: t.emitidas ? (t.concretadas / t.emitidas) * 100 : 0,
  }
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
  emitidas: number
  concretadas: number
}

/** Solicitudes emitidas por semana (según cuándo se emitieron), y cuántas de
 * ellas ya se concretaron. Las semanas sin ninguna quedan en cero para que el
 * gráfico no salte. Se devuelven las últimas `maxSemanas`. */
export function porSemana(solicitudes: SolicitudAuditoria[], maxSemanas = 26): PuntoSemana[] {
  const cuenta = new Map<number, { emitidas: number; concretadas: number }>()
  for (const s of solicitudes) {
    const dia = soloDia(s.emitida_en) ?? soloDia(s.fecha_solicitud)
    if (!dia) continue
    const lunes = lunesDe(dia)
    const c = cuenta.get(lunes) ?? { emitidas: 0, concretadas: 0 }
    c.emitidas++
    if (s.concretada) c.concretadas++
    cuenta.set(lunes, c)
  }
  if (cuenta.size === 0) return []
  const lunes = [...cuenta.keys()]
  const primero = Math.max(Math.min(...lunes), Math.max(...lunes) - (maxSemanas - 1) * 7 * DIA_MS)
  const ultimo = Math.max(...lunes)
  const puntos: PuntoSemana[] = []
  for (let t = primero; t <= ultimo; t += 7 * DIA_MS) {
    const f = new Date(t)
    const c = cuenta.get(t) ?? { emitidas: 0, concretadas: 0 }
    puntos.push({
      inicio: f.toISOString().slice(0, 10),
      etiqueta: `S${semanaIso(t)} · ${f.getUTCDate()} ${MESES[f.getUTCMonth()]}`,
      ...c,
    })
  }
  return puntos
}

export interface ClienteTop {
  cliente: string
  solicitudes: number
  concretadas: number
}

export const SIN_CLIENTE = 'Sin cliente'

export function topClientes(solicitudes: SolicitudAuditoria[], n = 10): ClienteTop[] {
  const por = new Map<string, ClienteTop>()
  for (const s of solicitudes) {
    const cliente = (s.sold_to ?? '').trim() || SIN_CLIENTE
    const c = por.get(cliente) ?? { cliente, solicitudes: 0, concretadas: 0 }
    c.solicitudes++
    if (s.concretada) c.concretadas++
    por.set(cliente, c)
  }
  return [...por.values()]
    .sort((a, b) => b.solicitudes - a.solicitudes || a.cliente.localeCompare(b.cliente, 'es'))
    .slice(0, n)
}
