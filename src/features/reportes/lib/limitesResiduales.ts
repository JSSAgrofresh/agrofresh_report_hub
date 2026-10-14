import type { InformeConPuntos } from './graficoResiduales'

/**
 * Límites residuales ESTÁTICOS por especie y analito (ppm), tal como los entregó el laboratorio en su tabla.
 * No se calculan con los datos: son las franjas fijas de la «Vista de límites» (modo Límites residuales).
 * Una especie o un analito que no está acá («NA» en la tabla) no tiene franja y no se evalúa.
 * Son independientes de los límites que se cargan en Report → Gestionar analitos.
 */
export interface RangoResidual {
  min: number
  max: number
}

const CITRICOS: Record<string, RangoResidual> = {
  FDL: { min: 0.7, max: 3 },
  PYR: { min: 1, max: 4 },
  IMZ: { min: 1, max: 5 },
  AZOX: { min: 0.7, max: 4 },
  TBZ: { min: 1, max: 4 },
}
const CAROZO_TEBU: Record<string, RangoResidual> = {
  FDL: { min: 0.7, max: 3 },
  PYR: { min: 1, max: 4 },
  TEBU: { min: 0.5, max: 0.6 },
}

export const LIMITES_RESIDUALES: Record<string, Record<string, RangoResidual>> = {
  'Arándano': { FDL: { min: 0.7, max: 3 } },
  'Cerezas': { FDL: { min: 0.7, max: 5 }, PYR: { min: 1, max: 4 }, TEBU: { min: 0.5, max: 4 } },
  'Ciruela': { FDL: { min: 0.7, max: 3 }, PYR: { min: 1, max: 4 }, TEBU: { min: 0.6, max: 1 } },
  'Clementina': CITRICOS,
  'Limón': CITRICOS,
  'Mandarina': CITRICOS,
  'Naranja': CITRICOS,
  'Pomelo': CITRICOS,
  'Manzana': { FDL: { min: 0.7, max: 3 }, PYR: { min: 1, max: 4 }, TBZ: { min: 1, max: 4 } },
  'Pera': { FDL: { min: 0.7, max: 3 }, PYR: { min: 1, max: 4 }, TBZ: { min: 1, max: 4 } },
  'Nectarín': CAROZO_TEBU,
  'Durazno': CAROZO_TEBU,
  'Kiwi': { FDL: { min: 0.7, max: 3 } },
}

/** «Cerezas», «cereza» y «CEREZA » son la misma especie; sin tildes y sin plural. */
function claveEspecie(especie: string): string {
  return especie
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/s$/, '')
}

const POR_CLAVE = new Map(Object.entries(LIMITES_RESIDUALES).map(([e, l]) => [claveEspecie(e), l]))

/** Los límites de una especie, o `null` si no hay tabla para ella (o no se eligió una). */
export function limitesDeEspecie(especie: string | null | undefined): Record<string, RangoResidual> | null {
  if (!especie || !especie.trim()) return null
  return POR_CLAVE.get(claveEspecie(especie)) ?? null
}

export type Posicion = 'dentro' | 'sobre' | 'bajo'

/** Dónde cae un resultado contra su franja. `null` si ese analito no tiene límite. */
export function posicionResidual(codigo: string, ppm: number, limites: Record<string, RangoResidual>): Posicion | null {
  const r = limites[codigo]
  if (!r) return null
  if (ppm > r.max) return 'sobre'
  if (ppm < r.min) return 'bajo'
  return 'dentro'
}

/** Cuánto se pasa del límite (positivo sobre el máximo, negativo bajo el mínimo, 0 dentro). */
export function desvioResidual(codigo: string, ppm: number, limites: Record<string, RangoResidual>): number {
  const r = limites[codigo]
  if (!r) return 0
  if (ppm > r.max) return ppm - r.max
  if (ppm < r.min) return ppm - r.min
  return 0
}

export interface FilaAnalitoResidual {
  codigo: string
  limite: RangoResidual
  evaluados: number
  fuera: number
  /** Promedio del desvío absoluto de los que quedaron fuera (0 si ninguno). */
  desvioPromedio: number
  /** El desvío (con signo) más grande; 0 si ninguno quedó fuera. */
  mayorDesvio: number
}

export interface ResumenResidual {
  informes: number
  /** Informes con al menos un resultado fuera de su franja. */
  informesFuera: number
  porAnalito: FilaAnalitoResidual[]
}

/**
 * Evalúa los informes contra las franjas. Un informe cuenta como «fuera de rango» si AL MENOS uno de sus
 * analitos con límite queda sobre el máximo o bajo el mínimo. Los analitos sin límite no se evalúan.
 * Se listan solo los analitos con límite que aparecen en los informes.
 */
export function resumenResidual(informes: InformeConPuntos[], limites: Record<string, RangoResidual>): ResumenResidual {
  let informesFuera = 0
  const acum = new Map<string, { evaluados: number; desvios: number[] }>()
  for (const inf of informes) {
    let fuera = false
    for (const p of inf.puntos) {
      if (p.ppm == null || !p.ingrediente || !limites[p.ingrediente]) continue
      const a = acum.get(p.ingrediente) ?? { evaluados: 0, desvios: [] }
      a.evaluados += 1
      const d = desvioResidual(p.ingrediente, p.ppm, limites)
      if (d !== 0) {
        a.desvios.push(d)
        fuera = true
      }
      acum.set(p.ingrediente, a)
    }
    if (fuera) informesFuera += 1
  }
  const porAnalito = [...acum.entries()]
    .map(([codigo, a]) => ({
      codigo,
      limite: limites[codigo],
      evaluados: a.evaluados,
      fuera: a.desvios.length,
      desvioPromedio: a.desvios.length ? a.desvios.reduce((s, d) => s + Math.abs(d), 0) / a.desvios.length : 0,
      mayorDesvio: a.desvios.length ? a.desvios.reduce((m, d) => (Math.abs(d) > Math.abs(m) ? d : m), 0) : 0,
    }))
    .sort((x, y) => x.codigo.localeCompare(y.codigo, 'es'))
  return { informes: informes.length, informesFuera, porAnalito }
}
