import type { PlantaAsignada } from '../types'

export const claveDePlanta = (p: PlantaAsignada) => `${p.clienteNombre}\u0000${p.plantaNombre ?? ''}`.toLowerCase()

export interface Grupo {
  cliente: string
  plantas: PlantaAsignada[]
}

/** Agrupa por Sold To, en orden alfabético; dentro de cada uno, «todo el Sold To» primero y luego las plantas. */
export function agruparPlantas(plantas: PlantaAsignada[]): Grupo[] {
  const mapa = new Map<string, Grupo>()
  for (const p of plantas) {
    const g = mapa.get(p.clienteNombre) ?? { cliente: p.clienteNombre, plantas: [] }
    g.plantas.push(p)
    mapa.set(p.clienteNombre, g)
  }
  return [...mapa.values()]
    .sort((a, b) => a.cliente.localeCompare(b.cliente, 'es'))
    .map((g) => ({
      ...g,
      plantas: [...g.plantas].sort((a, b) => (a.plantaNombre ?? '').localeCompare(b.plantaNombre ?? '', 'es')),
    }))
}
