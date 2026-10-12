import { estadoResultado, limiteDeAnalito } from './estadoResultado'
import type { Analito, LimiteAnalito, Observacion } from './tipos'

/**
 * Cuántos resultados caen fuera de rango, y qué porcentaje es.
 *
 * Hay dos formas de decir «fuera de rango» y las dos son reales:
 *  - `limite`: contra el límite residual cargado del analito (por especie y servicio).
 *    Sin límite cargado el resultado NO se da por «dentro»: queda como «sin límite».
 *  - `control`: contra los límites de control de la vista (promedio ± σ desviaciones
 *    estándar) de ese mismo analito, con los datos que dejan los filtros.
 *
 * El porcentaje se calcula solo sobre lo que se pudo evaluar: nunca se mezclan los
 * «sin límite» ni los «no detectados» con los «dentro».
 */

export type Criterio = 'limite' | 'control'
export type Dimension = 'analito' | 'cliente' | 'laboratorio' | 'servicio'
export type Clase = 'dentro' | 'sobre' | 'bajo' | 'sin_limite'

/** Con menos resultados que esto un analito no tiene límites de control confiables. */
export const MINIMO_CONTROL = 3

export interface Clasificado {
  obs: Observacion
  clase: Clase
}

export interface ConteoRango {
  dentro: number
  sobre: number
  bajo: number
  sin_limite: number
  /** sin valor numérico (no detectado u otro texto): no se pueden evaluar */
  nd: number
}

export const conteoVacio = (): ConteoRango => ({ dentro: 0, sobre: 0, bajo: 0, sin_limite: 0, nd: 0 })

function media(v: number[]) {
  return v.reduce((a, b) => a + b, 0) / v.length
}

function desviacion(v: number[], m: number) {
  return v.length > 1 ? Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1)) : 0
}

/** Clasifica cada resultado numérico. Los que no tienen valor numérico no se incluyen (ver `contar`). */
export function clasificar(
  observaciones: Observacion[],
  opciones: { criterio: Criterio; analitos: Analito[]; limites: LimiteAnalito[]; sigma: number },
): Clasificado[] {
  const numericas = observaciones.filter((o) => o.ingrediente && o.ppm != null)
  if (opciones.criterio === 'limite') {
    return numericas.map((obs) => ({
      obs,
      clase: estadoResultado(
        obs.ppm,
        limiteDeAnalito(opciones.analitos, opciones.limites, obs.ingrediente, obs.laboratorio, obs.crop, obs.tipoServicio),
      ) as Clase,
    }))
  }
  const porAnalito = new Map<string, number[]>()
  numericas.forEach((o) => porAnalito.set(o.ingrediente as string, [...(porAnalito.get(o.ingrediente as string) ?? []), o.ppm as number]))
  const bandas = new Map<string, { inf: number; sup: number } | null>()
  porAnalito.forEach((v, k) => {
    if (v.length < MINIMO_CONTROL) {
      bandas.set(k, null)
      return
    }
    const m = media(v)
    const d = desviacion(v, m)
    bandas.set(k, { inf: m - opciones.sigma * d, sup: m + opciones.sigma * d })
  })
  return numericas.map((obs) => {
    const b = bandas.get(obs.ingrediente as string)
    if (!b) return { obs, clase: 'sin_limite' as Clase }
    const v = obs.ppm as number
    return { obs, clase: (v > b.sup ? 'sobre' : v < b.inf ? 'bajo' : 'dentro') as Clase }
  })
}

export function etiquetaDimension(o: Observacion, dim: Dimension): string {
  const v =
    dim === 'analito' ? o.ingrediente
    : dim === 'cliente' ? o.cliente
    : dim === 'laboratorio' ? o.laboratorio
    : o.tipoAplicacion ?? o.tipoServicio
  return (v ?? '').trim() || 'Sin dato'
}

export interface FilaRango extends ConteoRango {
  clave: string
  /** resultados con valor numérico */
  n: number
  /** resultados que se pudieron evaluar: dentro + sobre + bajo */
  evaluados: number
  /** (sobre + bajo) / evaluados, 0-100; null si no se pudo evaluar ninguno */
  pctFuera: number | null
}

export const pctFuera = (c: ConteoRango): number | null => {
  const ev = c.dentro + c.sobre + c.bajo
  return ev ? ((c.sobre + c.bajo) / ev) * 100 : null
}

/** Cuenta todo (también los no detectados, que vienen aparte en `todas`). */
export function contar(clasificados: Clasificado[], noDetectados = 0): ConteoRango {
  const c = conteoVacio()
  clasificados.forEach((x) => { c[x.clase] += 1 })
  c.nd = noDetectados
  return c
}

/** Una fila por analito / cliente / laboratorio / servicio: de más a menos fuera de rango. */
export function agrupar(clasificados: Clasificado[], dim: Dimension): FilaRango[] {
  const por = new Map<string, Clasificado[]>()
  clasificados.forEach((x) => {
    const k = etiquetaDimension(x.obs, dim)
    por.set(k, [...(por.get(k) ?? []), x])
  })
  return [...por.entries()]
    .map(([clave, lista]) => {
      const c = contar(lista)
      return { clave, ...c, n: lista.length, evaluados: c.dentro + c.sobre + c.bajo, pctFuera: pctFuera(c) }
    })
    .sort((a, b) => (b.pctFuera ?? -1) - (a.pctFuera ?? -1) || b.n - a.n || a.clave.localeCompare(b.clave, 'es'))
}
