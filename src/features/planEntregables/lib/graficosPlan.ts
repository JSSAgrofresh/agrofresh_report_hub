import { porClienteResiduosFsmaFito, soloAnalisis } from '@/features/auditoriaInterna'
import type { AnalisisVisible, SolicitudAuditoria } from '@/features/auditoriaInterna'
import type { ClientePlan } from './api'
import { SEMANAS_PLAN, laboratorioDe, semanaDeSolicitud, servicioDeLab } from './avanceSemanal'
import { normalizarNombre, type FilaPlan } from './plan'

export interface SemanaGrafico {
  semana: string
  /** Lo que el plan propone para esa semana. */
  propuesto: number
  /** Los análisis que ya se hicieron esa semana. */
  hecho: number
}

/** Por cada semana de la temporada, lo propuesto por el plan y lo hecho, contando solo los análisis visibles. */
export function propuestoYHechoPorSemana(
  solicitudes: SolicitudAuditoria[],
  plan: Map<string, ClientePlan> | null,
  visibles: FilaPlan[] = ['residuales', 'fsma', 'fito'],
): SemanaGrafico[] {
  const filas = new Map<string, SemanaGrafico>(SEMANAS_PLAN.map((s) => [s, { semana: s, propuesto: 0, hecho: 0 }]))
  for (const cp of plan?.values() ?? []) {
    for (const s of cp.semanas ?? []) {
      if (visibles.includes(s.servicio)) {
        const f = filas.get(s.semana)
        if (f) f.propuesto += s.propuesta
      }
    }
  }
  for (const sol of solicitudes) {
    const lab = laboratorioDe(sol)
    const semana = semanaDeSolicitud(sol)
    if (!lab || !semana || !(sol.sold_to ?? '').trim() || !visibles.includes(servicioDeLab(lab))) continue
    const f = filas.get(semana)
    if (f) f.hecho++
  }
  return SEMANAS_PLAN.map((s) => filas.get(s)!)
}

export interface ClienteTop {
  cliente: string
  agrofresh: number
  quiteca: number
  fsma: number
  fito: number
  total: number
  /** Lo que el plan propone para este cliente (en los análisis visibles); `null` si el plan no lo trae. */
  propuesto: number | null
}

/**
 * Los clientes con más análisis hechos (por Sold To), cada uno dividido entre Residuales —AgroFresh y Quiteca—, FSMA (ALS) y FITO (Diagnofruit).
 * Solo cuentan los análisis visibles.
 */
export function topClientes(
  solicitudes: SolicitudAuditoria[],
  visibles: AnalisisVisible[],
  plan: Map<string, ClientePlan> | null,
  limite = 10,
): ClienteTop[] {
  const filas = soloAnalisis(porClienteResiduosFsmaFito(solicitudes, 'cliente'), visibles)
  return filas.slice(0, limite).map((f) => {
    const p = plan?.get(normalizarNombre(f.cliente))
    const prometido = p ? visibles.reduce((n, a) => n + (p.propuesta[a] ?? 0), 0) : 0
    return {
      cliente: f.cliente,
      agrofresh: f.agrofresh.n,
      quiteca: f.quiteca.n,
      fsma: f.fsma.n,
      fito: f.fito.n,
      total: f.total,
      propuesto: prometido > 0 ? prometido : null,
    }
  })
}
