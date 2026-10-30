import type { PlantaAsignada } from '../types'

export const claveDePlanta = (p: PlantaAsignada) => `${p.clienteNombre}\u0000${p.plantaNombre ?? ''}\u0000${p.especie ?? ''}`.toLowerCase()

/** Cómo se lee un acceso: la planta (o «todas las plantas») y, si la limita, su especie. */
export const etiquetaDeAcceso = (p: PlantaAsignada) =>
  `${p.plantaNombre ?? 'Todas las plantas de este Sold To'}${p.especie ? ` · ${p.especie}` : ''}`

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
      plantas: [...g.plantas].sort(
        (a, b) =>
          (a.plantaNombre ?? '').localeCompare(b.plantaNombre ?? '', 'es') || (a.especie ?? '').localeCompare(b.especie ?? '', 'es'),
      ),
    }))
}

/** Una fila por planta (o «todo el Sold To»), con sus accesos: las especies de una misma planta van juntas. */
export function porPlanta(accesos: PlantaAsignada[]): { planta: string | null; accesos: PlantaAsignada[] }[] {
  const mapa = new Map<string, { planta: string | null; accesos: PlantaAsignada[] }>()
  for (const a of accesos) {
    const k = (a.plantaNombre ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
    const fila = mapa.get(k) ?? { planta: a.plantaNombre ?? null, accesos: [] }
    fila.accesos.push(a)
    mapa.set(k, fila)
  }
  return [...mapa.values()]
}
