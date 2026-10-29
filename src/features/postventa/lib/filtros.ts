import type { ResumenCargaTrace } from './api'
import { fechaDeCarga } from './resumen'

/**
 * Filtros del reporte de Accu-Tab (los mismos para el equipo de Post Venta y para el cliente): Sold To, Ship To,
 * posición de muestreo, equipo, semana y un rango de fechas. Cada uno admite varios valores (vacío = todos).
 */
export interface FiltroAccutab {
  soldTo: string[]
  shipTo: string[]
  posicion: string[]
  equipo: string[]
  /** Semana ISO de la carga: «2026-S43». */
  semana: string[]
  rango: { desde: string; hasta: string } | null
}

export const FILTRO_ACCUTAB_VACIO: FiltroAccutab = {
  soldTo: [],
  shipTo: [],
  posicion: [],
  equipo: [],
  semana: [],
  rango: null,
}

export type CampoAccutab = 'soldTo' | 'shipTo' | 'posicion' | 'equipo' | 'semana'

const dos = (n: number) => String(n).padStart(2, '0')

/** Semana ISO (lunes a domingo) de una fecha AAAA-MM-DD: «2026-S43». El año es el de la semana, no el del día. */
export function semanaIso(fecha: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha ?? '')
  if (!m) return null
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const inicio = Date.UTC(d.getUTCFullYear(), 0, 1)
  const semana = Math.ceil(((d.getTime() - inicio) / 86_400_000 + 1) / 7)
  return `${d.getUTCFullYear()}-S${dos(semana)}`
}

/** «2026-S43» -> «Semana 43 · 2026». */
export function etiquetaSemana(semana: string): string {
  const m = /^(\d{4})-S(\d{2})$/.exec(semana)
  return m ? `Semana ${Number(m[2])} · ${m[1]}` : semana
}

function normal(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase()
}

function valorDe(c: ResumenCargaTrace, campo: CampoAccutab): string | null {
  switch (campo) {
    case 'soldTo':
      return c.cliente
    case 'shipTo':
      return c.planta
    case 'posicion':
      return c.ubicacion ?? null
    case 'equipo':
      return c.equipo
    case 'semana':
      return semanaIso(fechaDeCarga(c))
  }
}

const CAMPOS: CampoAccutab[] = ['soldTo', 'shipTo', 'posicion', 'equipo', 'semana']

function cumple(c: ResumenCargaTrace, f: FiltroAccutab, excepto?: CampoAccutab): boolean {
  for (const campo of CAMPOS) {
    if (campo === excepto || f[campo].length === 0) continue
    const v = normal(valorDe(c, campo))
    if (!f[campo].some((x) => normal(x) === v)) return false
  }
  if (f.rango) {
    const fecha = fechaDeCarga(c)
    if (!fecha || fecha < f.rango.desde || fecha > f.rango.hasta) return false
  }
  return true
}

export function filtrarAccutab(cargas: ResumenCargaTrace[], f: FiltroAccutab): ResumenCargaTrace[] {
  return cargas.filter((c) => cumple(c, f))
}

/**
 * Lo que ofrece un filtro: los valores que quedan con TODOS LOS DEMÁS filtros puestos (así los filtros se acotan
 * entre sí: elegido un Sold To, el Ship To solo ofrece sus plantas). Lo ya marcado se conserva aunque quede en cero.
 * Las semanas van de la más reciente a la más antigua; el resto, en orden alfabético.
 */
export function opcionesAccutab(cargas: ResumenCargaTrace[], f: FiltroAccutab, campo: CampoAccutab): string[] {
  const porClave = new Map<string, string>()
  cargas.forEach((c) => {
    if (!cumple(c, f, campo)) return
    const v = valorDe(c, campo)?.trim()
    if (v && !porClave.has(normal(v))) porClave.set(normal(v), v)
  })
  f[campo].forEach((v) => {
    if (!porClave.has(normal(v))) porClave.set(normal(v), v)
  })
  const lista = [...porClave.values()]
  return campo === 'semana'
    ? lista.sort((a, b) => b.localeCompare(a))
    : lista.sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
}

/** Cuántos filtros hay puestos (el rango cuenta como uno). */
export function contarFiltros(f: FiltroAccutab): number {
  return CAMPOS.filter((c) => f[c].length > 0).length + (f.rango ? 1 : 0)
}
