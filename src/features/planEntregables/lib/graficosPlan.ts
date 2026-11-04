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

export interface PlantaDetalle {
  planta: string
  agrofresh: number
  quiteca: number
  fsma: number
  fito: number
  total: number
  /** Lo que el plan propone para esa planta (solo si se llama igual que una del plan); `null` si no hay. */
  propuesto: number | null
}

export interface DetalleCliente {
  cliente: string
  comercial: string | null
  tipo: string | null
  total: number
  propuesto: number | null
  plantas: PlantaDetalle[]
}

/**
 * El detalle de UN cliente: por sucursal (Ship To), sus análisis hechos divididos por laboratorio (AgroFresh y Quiteca en Residuales,
 * FSMA, FITO), con lo que el plan propone para cada planta. Respeta los análisis visibles.
 */
export function detalleDeCliente(
  solicitudes: SolicitudAuditoria[],
  plan: Map<string, ClientePlan> | null,
  cliente: string,
  visibles: AnalisisVisible[],
): DetalleCliente {
  const k = normalizarNombre(cliente)
  const cp = plan?.get(k)
  const por = new Map<string, PlantaDetalle>()
  const fila = (nombre: string) => {
    const id = normalizarNombre(nombre)
    let p = por.get(id)
    if (!p) {
      p = { planta: nombre, agrofresh: 0, quiteca: 0, fsma: 0, fito: 0, total: 0, propuesto: null }
      por.set(id, p)
    }
    return p
  }
  for (const s of solicitudes) {
    const lab = laboratorioDe(s)
    if (!lab || normalizarNombre(s.sold_to ?? '') !== k || !visibles.includes(servicioDeLab(lab))) continue
    const p = fila((s.ship_to ?? '').trim() || 'Sin Ship To')
    if (lab === 'AGROFRESH') p.agrofresh++
    else if (lab === 'QUITECA') p.quiteca++
    else if (lab === 'ALS') p.fsma++
    else p.fito++
    p.total++
  }
  for (const s of cp?.semanas ?? []) {
    if (!visibles.includes(s.servicio)) continue
    const p = fila(s.planta)
    p.propuesto = (p.propuesto ?? 0) + s.propuesta
  }
  const plantas = [...por.values()].filter((p) => p.total > 0 || (p.propuesto ?? 0) > 0).sort((a, b) => b.total - a.total || (b.propuesto ?? 0) - (a.propuesto ?? 0) || a.planta.localeCompare(b.planta, 'es'))
  const propuesto = cp ? visibles.reduce((n, a) => n + (cp.propuesta[a] ?? 0), 0) : 0
  const semanas = cp?.semanas ?? []
  const moda = (v: (string | null | undefined)[]) => {
    const c = new Map<string, number>()
    for (const x of v) if (x && x.trim()) c.set(x.trim(), (c.get(x.trim()) ?? 0) + 1)
    return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  }
  return {
    cliente: cp?.sold_to ?? cliente,
    comercial: moda(semanas.map((s) => s.comercial ?? cp?.comercial)),
    tipo: moda(semanas.map((s) => s.tipo_cliente)),
    total: plantas.reduce((n, p) => n + p.total, 0),
    propuesto: propuesto > 0 ? propuesto : null,
    plantas,
  }
}
