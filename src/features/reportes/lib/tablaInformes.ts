import type { AnalitoLinea, InformeLinea } from './lineaTiempoInformes'

/**
 * Lógica pura de la tabla por informe de ALS y Diagnofruit en Report: orden, búsqueda, páginas, resumen por analito y
 * la descarga en CSV. Un informe es una fila; cada analito, una columna.
 */

export type DireccionOrden = 'asc' | 'desc'

/** Qué columna ordena: `fecha`, `nro`, `detalle`, `estado` o `a:<código del analito>`. */
export interface Orden {
  col: string
  dir: DireccionOrden
}

/** Lo más reciente primero. */
export const ORDEN_INICIAL: Orden = { col: 'fecha', dir: 'desc' }

export const TAMANOS_PAGINA = [10, 25, 50, 100] as const

export const columnaAnalito = (codigo: string) => `a:${codigo}`

/** Cuántos analitos se detectaron en el informe. */
export function detectadosDe(inf: InformeLinea): number {
  return Object.values(inf.porAnalito).filter((r) => r.detectado).length
}

/** Cuántos analitos trae el informe. */
export function analitosDe(inf: InformeLinea): number {
  return Object.keys(inf.porAnalito).length
}

const sinTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Lo que se compara al ordenar: texto para fecha/N°/zona, número para estado y analitos (no detectado 0, sin dato -1). */
function clave(inf: InformeLinea, col: string): string | number {
  if (col === 'fecha') return inf.fecha ?? ''
  if (col === 'nro') return inf.nro
  if (col === 'detalle') return sinTildes(inf.detalle ?? '')
  if (col === 'estado') return detectadosDe(inf)
  if (col.startsWith('a:')) {
    const r = inf.porAnalito[col.slice(2)]
    if (!r) return -1
    return r.detectado ? (r.valor ?? Number.MAX_SAFE_INTEGER) : 0
  }
  return ''
}

const comparar = (a: string | number, b: string | number): number =>
  typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'es', { numeric: true })

/** Los informes ordenados; a igual valor, el más reciente primero. No cambia la lista que recibe. */
export function ordenarInformes(informes: InformeLinea[], orden: Orden): InformeLinea[] {
  const signo = orden.dir === 'asc' ? 1 : -1
  return [...informes].sort((a, b) => {
    const c = comparar(clave(a, orden.col), clave(b, orden.col))
    if (c !== 0) return c * signo
    return comparar(clave(b, 'fecha'), clave(a, 'fecha')) || comparar(b.nro, a.nro)
  })
}

/** Al tocar el encabezado de una columna: la primera vez ordena así, la segunda al revés. */
export function alternarOrden(actual: Orden, col: string): Orden {
  if (actual.col !== col) return { col, dir: col === 'fecha' || col === 'estado' || col.startsWith('a:') ? 'desc' : 'asc' }
  return { col, dir: actual.dir === 'asc' ? 'desc' : 'asc' }
}

/** Los informes que calzan con lo escrito en el buscador (N°, zona o fecha), sin importar mayúsculas ni tildes. */
export function filtrarInformes(informes: InformeLinea[], texto: string): InformeLinea[] {
  const palabras = sinTildes(texto).split(/\s+/).filter(Boolean)
  if (!palabras.length) return informes
  return informes.filter((i) => {
    const heno = sinTildes(`${i.nro} ${i.etiqueta} ${i.detalle ?? ''} ${i.fechaTxt}`)
    return palabras.every((p) => heno.includes(p))
  })
}

export interface Pagina<T> {
  filas: T[]
  pagina: number
  paginas: number
  /** Posición (1 en adelante) de la primera y la última fila que se ven; 0 si no hay filas. */
  desde: number
  hasta: number
}

/** Una página de la lista. Si la página pedida ya no existe (se filtró), se queda en la última. */
export function paginar<T>(filas: T[], pagina: number, tamano: number): Pagina<T> {
  const paginas = Math.max(1, Math.ceil(filas.length / tamano))
  const actual = Math.min(Math.max(1, pagina), paginas)
  const i = (actual - 1) * tamano
  const trozo = filas.slice(i, i + tamano)
  return { filas: trozo, pagina: actual, paginas, desde: trozo.length ? i + 1 : 0, hasta: i + trozo.length }
}

export interface ResumenAnalito {
  codigo: string
  detectados: number
  total: number
}

/** Por analito, en cuántos informes se detectó, de los que lo midieron. */
export function resumenPorAnalito(informes: InformeLinea[], analitos: AnalitoLinea[]): ResumenAnalito[] {
  return analitos.map((a) => {
    const medidos = informes.map((i) => i.porAnalito[a.codigo]).filter(Boolean)
    return { codigo: a.codigo, detectados: medidos.filter((r) => r.detectado).length, total: medidos.length }
  })
}

const celda = (v: string) => `"${v.replace(/"/g, '""')}"`

/**
 * La tabla como CSV para Excel en español: separador «;», comillas, y una marca al inicio para que se lean las tildes.
 * Los valores van como se ven en pantalla («4,66», «<1», «BLD»).
 */
export function csvDeInformes(informes: InformeLinea[], analitos: AnalitoLinea[], columnaDetalle: string | null, estadoPendiente = false): string {
  const encabezado = [
    'Fecha de muestreo',
    'N° de informe',
    ...(columnaDetalle ? [columnaDetalle] : []),
    ...analitos.map((a) => (a.unidad ? `${a.nombre} (${a.unidad})` : a.nombre)),
    'Estado',
  ]
  const filas = informes.map((i) => [
    i.fechaTxt,
    i.nro,
    ...(columnaDetalle ? [i.detalle ?? ''] : []),
    ...analitos.map((a) => i.porAnalito[a.codigo]?.texto ?? ''),
    estadoPendiente ? 'Pendiente' : detectadosDe(i) > 0 ? `Con detección (${detectadosDe(i)} de ${analitosDe(i)})` : 'Sin detección',
  ])
  return '﻿' + [encabezado, ...filas].map((f) => f.map(celda).join(';')).join('\r\n')
}
