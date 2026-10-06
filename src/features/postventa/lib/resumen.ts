import type { ResumenCargaTrace } from './api'

/**
 * Vista general de Accu-Tab: cuentas sobre la LISTA de cargas (lo que ya
 * entrega /postventa/registros), sin bajar las mediciones de cada una. Cada
 * carga trae su promedio de pH y ORP y cuántas mediciones tiene; con eso
 * alcanza para ver la evolución entre cargas y compararlas por equipo.
 */

export type Periodo = 'todo' | '30' | '90' | '365'

export interface FiltroCargas {
  /** Sold To. */
  cliente: string
  /** Ship To. */
  planta: string
  /** Posición de muestreo. */
  ubicacion: string
  equipo: string
  periodo: Periodo
}

export const FILTRO_CARGAS_VACIO: FiltroCargas = { cliente: '', planta: '', ubicacion: '', equipo: '', periodo: 'todo' }

/** Fecha (AAAA-MM-DD) de una carga: sale del nombre de la carpeta, que es
 * la marca de cuándo se guardó ("2026-08-24_14-32-07"); si no calza, del ISO. */
export function fechaDeCarga(c: Pick<ResumenCargaTrace, 'carpeta' | 'guardado_en'>): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})_/.exec(c.carpeta)
  if (m) return m[1]
  return c.guardado_en ? c.guardado_en.slice(0, 10) : null
}

/** "PH_ORP_EQUIPO_3" -> "Ph Orp Equipo 3". */
export function nombreEquipo(equipo: string): string {
  return equipo
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function normal(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase()
}

export function filtrarCargas(
  cargas: ResumenCargaTrace[],
  f: FiltroCargas,
  hoy: Date = new Date(),
): ResumenCargaTrace[] {
  let desde: string | null = null
  if (f.periodo !== 'todo') {
    const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate()))
    d.setUTCDate(d.getUTCDate() - Number(f.periodo))
    desde = d.toISOString().slice(0, 10)
  }
  return cargas.filter((c) => {
    if (f.cliente && normal(c.cliente) !== normal(f.cliente)) return false
    if (f.planta && normal(c.planta) !== normal(f.planta)) return false
    if (f.ubicacion && normal(c.ubicacion) !== normal(f.ubicacion)) return false
    if (f.equipo && normal(c.equipo) !== normal(f.equipo)) return false
    if (desde) {
      const fecha = fechaDeCarga(c)
      if (!fecha || fecha < desde) return false
    }
    return true
  })
}

/** Valores distintos de un campo (sin repetir por mayúsculas), ordenados. */
export function opcionesDeCampo(
  cargas: ResumenCargaTrace[],
  campo: 'cliente' | 'planta' | 'ubicacion' | 'equipo',
): string[] {
  const porClave = new Map<string, string>()
  cargas.forEach((c) => {
    const v = c[campo]
    if (v && v.trim() && !porClave.has(normal(v))) porClave.set(normal(v), v.trim())
  })
  return [...porClave.values()].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
}

export interface Kpis {
  cargas: number
  equipos: number
  clientes: number
  mediciones: number
  /** Promedios ponderados por mediciones: una carga de 2.000 lecturas pesa
   * más que una de 20, igual que si se promediaran todas las lecturas. */
  phPromedio: number | null
  mvPromedio: number | null
  ultima: string | null
  porCorreo: number
}

function ponderado(
  cargas: ResumenCargaTrace[],
  campo: 'ph_promedio' | 'mv_promedio',
): number | null {
  let suma = 0
  let peso = 0
  cargas.forEach((c) => {
    const v = c[campo]
    if (v == null || Number.isNaN(v)) return
    const w = Math.max(c.n_registros, 1)
    suma += v * w
    peso += w
  })
  return peso ? suma / peso : null
}

export function calcularKpis(cargas: ResumenCargaTrace[]): Kpis {
  const fechas = cargas
    .map(fechaDeCarga)
    .filter((f): f is string => f != null)
    .sort()
  return {
    cargas: cargas.length,
    equipos: opcionesDeCampo(cargas, 'equipo').length,
    clientes: opcionesDeCampo(cargas, 'cliente').length,
    mediciones: cargas.reduce((s, c) => s + c.n_registros, 0),
    phPromedio: ponderado(cargas, 'ph_promedio'),
    mvPromedio: ponderado(cargas, 'mv_promedio'),
    ultima: fechas.length ? fechas[fechas.length - 1] : null,
    porCorreo: cargas.filter((c) => c.origen === 'email').length,
  }
}

/** Cargas en orden cronológico (la más antigua primero), para los gráficos. */
export function cronologico(cargas: ResumenCargaTrace[]): ResumenCargaTrace[] {
  return [...cargas].sort((a, b) => a.carpeta.localeCompare(b.carpeta))
}

/** Cargas por mes (AAAA-MM), separadas por origen, con los meses vacíos entre
 * el primero y el último -un hueco en el gráfico es información-. */
export function cargasPorMes(
  cargas: ResumenCargaTrace[],
): { mes: string; manual: number; email: number }[] {
  const conteo = new Map<string, { manual: number; email: number }>()
  cargas.forEach((c) => {
    const f = fechaDeCarga(c)
    if (!f) return
    const mes = f.slice(0, 7)
    const e = conteo.get(mes) ?? { manual: 0, email: 0 }
    e[c.origen === 'email' ? 'email' : 'manual'] += 1
    conteo.set(mes, e)
  })
  const meses = [...conteo.keys()].sort()
  if (!meses.length) return []
  const salida: { mes: string; manual: number; email: number }[] = []
  let [a, m] = meses[0].split('-').map(Number)
  const [aFin, mFin] = meses[meses.length - 1].split('-').map(Number)
  while (a < aFin || (a === aFin && m <= mFin)) {
    const mes = `${a}-${String(m).padStart(2, '0')}`
    salida.push({ mes, ...(conteo.get(mes) ?? { manual: 0, email: 0 }) })
    m += 1
    if (m > 12) {
      m = 1
      a += 1
    }
  }
  return salida
}

/** Por equipo: cuántas cargas y su pH/ORP promedio ponderado, de más a menos cargas. */
export function resumenPorEquipo(cargas: ResumenCargaTrace[]) {
  const grupos = new Map<string, { equipo: string; lista: ResumenCargaTrace[] }>()
  cargas.forEach((c) => {
    const equipo = c.equipo?.trim() || 'Sin equipo'
    const g = grupos.get(normal(equipo)) ?? { equipo, lista: [] }
    g.lista.push(c)
    grupos.set(normal(equipo), g)
  })
  return [...grupos.values()]
    .map((g) => ({
      equipo: g.equipo,
      cargas: g.lista.length,
      ph: ponderado(g.lista, 'ph_promedio'),
      mv: ponderado(g.lista, 'mv_promedio'),
    }))
    .sort((a, b) => b.cargas - a.cargas || a.equipo.localeCompare(b.equipo, 'es'))
}
