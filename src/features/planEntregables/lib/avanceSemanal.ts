import type { SolicitudAuditoria } from '@/features/auditoriaInterna'
import { normalizarNombre, type FilaPlan } from './plan'

/** Las semanas de la temporada del plan, en orden: W41…W52 y después W01, W02. */
export const SEMANAS_PLAN = ['W41', 'W42', 'W43', 'W44', 'W45', 'W46', 'W47', 'W48', 'W49', 'W50', 'W51', 'W52', 'W01', 'W02']

/** Las semanas del peak de la temporada (hoja «Propuesta» del plan: 49-50). */
export const SEMANAS_PEAK = ['W49', 'W50']

/** Lugar de una semana en la temporada (0 = W41); -1 si no es de la temporada. */
export function ordenSemana(codigo: string | null | undefined): number {
  return codigo ? SEMANAS_PLAN.indexOf(codigo.trim().toUpperCase()) : -1
}

/** Semana ISO («W46») de una fecha ISO. Solo las de la temporada del plan: W41 a W52 de 2026 (la 53 cuenta como W52) y W01 y W02 de 2027.
 * Una fecha de fuera de la temporada no tiene semana (`null`) y no cuenta. */
export function semanaDeFecha(fecha: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha ?? '')
  if (!m) return null
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  if (Number.isNaN(d.getTime())) return null
  // Semana ISO: el jueves de esa semana manda sobre el año.
  const dia = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dia)
  const anio = d.getUTCFullYear()
  const semana = Math.ceil(((d.getTime() - Date.UTC(anio, 0, 1)) / 86400000 + 1) / 7)
  if (anio === 2026 && semana >= 41) return `W${Math.min(semana, 52)}`
  if (anio === 2027 && semana <= 2) return `W0${semana}`
  return null
}

export type Laboratorio = 'AGROFRESH' | 'QUITECA' | 'ALS' | 'DIAGNOFRUIT'

export function laboratorioDe(s: SolicitudAuditoria): Laboratorio | null {
  const l = normalizarNombre(s.laboratorio ?? '')
  return l === 'AGROFRESH' || l === 'QUITECA' || l === 'ALS' || l === 'DIAGNOFRUIT' ? l : null
}

/** Qué análisis del plan es lo que hace cada laboratorio: AgroFresh y Quiteca = Residuales, ALS = FSMA, Diagnofruit = FITO. */
export function servicioDeLab(l: Laboratorio): FilaPlan {
  return l === 'ALS' ? 'fsma' : l === 'DIAGNOFRUIT' ? 'fito' : 'residuales'
}

/** La semana (de la temporada) en la que cuenta un análisis: la de su muestreo; si no, la de la solicitud; si no, la de su emisión. */
export function semanaDeSolicitud(s: SolicitudAuditoria): string | null {
  return semanaDeFecha(s.fecha_muestreo ?? s.fecha_solicitud ?? s.emitida_en)
}

/** La semana de la temporada que corresponde a hoy; si hoy está antes de W41 es la primera, y si pasó W02, la última. */
export function semanaActual(hoy: Date = new Date()): string {
  const iso = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
  const s = semanaDeFecha(iso)
  if (s) return s
  return hoy.getTime() < Date.UTC(2026, 9, 5) ? SEMANAS_PLAN[0] : SEMANAS_PLAN[SEMANAS_PLAN.length - 1]
}
