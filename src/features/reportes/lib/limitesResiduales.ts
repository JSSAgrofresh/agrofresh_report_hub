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

/** La especie de un informe (la de sus resultados; en un informe es siempre la misma). */
export function especieDeInforme(inf: InformeConPuntos): string {
  return inf.puntos.find((p) => p.crop && String(p.crop).trim())?.crop ?? ''
}

/** Las franjas que rigen a un informe: las de SU especie (no hace falta elegir una en los filtros). */
export function limitesDeInforme(inf: InformeConPuntos): Record<string, RangoResidual> | null {
  return limitesDeEspecie(especieDeInforme(inf))
}

export interface FilaAnalitoResidual {
  codigo: string
  /** Rangos distintos que rigieron a este analito (uno por especie con tabla; casi siempre uno o dos). */
  rangos: RangoResidual[]
  evaluados: number
  sobre: number
  bajo: number
  /** sobre + bajo. */
  fuera: number
  /** Promedio del desvío absoluto de los que quedaron fuera (0 si ninguno). */
  desvioPromedio: number
  /** El desvío (con signo) más grande; 0 si ninguno quedó fuera. */
  mayorDesvio: number
}

export interface ResumenResidual {
  /** Todos los informes que se miran. */
  informes: number
  /** Informes que se pudieron evaluar (su especie está en la tabla y trae algún analito con límite). */
  informesEvaluados: number
  /** Informes sin franja: su especie no está en la tabla, o ninguno de sus analitos tiene límite. */
  informesSinLimite: number
  /** Informes con al menos un resultado fuera de su franja. */
  informesFuera: number
  /** Informes con al menos un resultado sobre el máximo. */
  informesSobre: number
  /** Informes con al menos un resultado bajo el mínimo. */
  informesBajo: number
  porAnalito: FilaAnalitoResidual[]
}

/** Las franjas de todos los informes a la vez (una sola especie) o de cada uno según su especie. */
export type FuenteLimites = Record<string, RangoResidual> | ((inf: InformeConPuntos) => Record<string, RangoResidual> | null)

/**
 * Evalúa los informes contra las franjas. Cada informe se juzga con los límites de SU especie, así que no hace
 * falta filtrar por una. Un informe cuenta como «fuera de rango» si AL MENOS uno de sus analitos con límite queda
 * sobre el máximo (sobre) o bajo el mínimo (bajo); puede contar en los dos. Los analitos sin límite no se evalúan.
 */
export function resumenResidual(informes: InformeConPuntos[], fuente: FuenteLimites): ResumenResidual {
  const de = typeof fuente === 'function' ? fuente : () => fuente
  let informesEvaluados = 0
  let informesFuera = 0
  let informesSobre = 0
  let informesBajo = 0
  type Acum = { evaluados: number; sobre: number; bajo: number; desvios: number[]; rangos: Map<string, RangoResidual> }
  const acum = new Map<string, Acum>()
  for (const inf of informes) {
    const lim = de(inf)
    let evaluado = false
    let sobre = false
    let bajo = false
    for (const p of inf.puntos) {
      if (!lim || p.ppm == null || !p.ingrediente || !lim[p.ingrediente]) continue
      evaluado = true
      const r = lim[p.ingrediente]
      const a: Acum = acum.get(p.ingrediente) ?? { evaluados: 0, sobre: 0, bajo: 0, desvios: [], rangos: new Map() }
      a.evaluados += 1
      a.rangos.set(`${r.min}-${r.max}`, r)
      const d = desvioResidual(p.ingrediente, p.ppm, lim)
      if (d > 0) {
        a.sobre += 1
        a.desvios.push(d)
        sobre = true
      } else if (d < 0) {
        a.bajo += 1
        a.desvios.push(d)
        bajo = true
      }
      acum.set(p.ingrediente, a)
    }
    if (evaluado) informesEvaluados += 1
    if (sobre || bajo) informesFuera += 1
    if (sobre) informesSobre += 1
    if (bajo) informesBajo += 1
  }
  const porAnalito: FilaAnalitoResidual[] = [...acum.entries()]
    .map(([codigo, a]) => ({
      codigo,
      rangos: [...a.rangos.values()].sort((x, y) => x.min - y.min || x.max - y.max),
      evaluados: a.evaluados,
      sobre: a.sobre,
      bajo: a.bajo,
      fuera: a.sobre + a.bajo,
      desvioPromedio: a.desvios.length ? a.desvios.reduce((t, d) => t + Math.abs(d), 0) / a.desvios.length : 0,
      mayorDesvio: a.desvios.length ? a.desvios.reduce((m, d) => (Math.abs(d) > Math.abs(m) ? d : m), 0) : 0,
    }))
    .sort((x, y) => x.codigo.localeCompare(y.codigo, 'es'))
  return {
    informes: informes.length,
    informesEvaluados,
    informesSinLimite: informes.length - informesEvaluados,
    informesFuera,
    informesSobre,
    informesBajo,
    porAnalito,
  }
}
