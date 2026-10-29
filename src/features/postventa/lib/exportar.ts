import type { CargaTrace, FilaTrace, ResumenCargaTrace } from './api'
import { semanaIso } from './filtros'
import { fechaDeCarga, nombreEquipo } from './resumen'

type Celda = string | number | null

/** Una hoja de Excel admite 1.048.576 filas; la descarga se corta antes para que el navegador no se quede sin memoria. */
export const LIMITE_FILAS_EXCEL = 500_000

/** Cuántas mediciones traería la «BD de registros» de estas cargas. */
export function totalMediciones(cargas: ResumenCargaTrace[]): number {
  return cargas.reduce((s, c) => s + c.n_registros, 0)
}

const ORIGEN = { email: 'Correo', manual: 'Carga manual' } as const

/** BD de informes: una fila por carga (lo mismo que la tabla de informes). */
export function filasBdInformes(cargas: ResumenCargaTrace[]): Celda[][] {
  const filas: Celda[][] = [
    ['Fecha de carga', 'Semana', 'Sold To', 'Ship To', 'Posición de muestreo', 'Equipo', 'Origen', 'Mediciones', 'Informe PDF', 'Carpeta'],
  ]
  cargas.forEach((c) => {
    const fecha = fechaDeCarga(c)
    filas.push([
      fecha,
      semanaIso(fecha),
      c.cliente,
      c.planta,
      c.ubicacion ?? null,
      c.equipo ? nombreEquipo(c.equipo) : null,
      ORIGEN[c.origen] ?? c.origen,
      c.n_registros,
      c.tiene_pdf ? 'Sí' : 'No',
      c.carpeta,
    ])
  })
  return filas
}

/** BD de registros: una fila por medición, con los datos de su informe al lado, para poder filtrar y cruzar en Excel. */
export function filasBdRegistros(cargas: ResumenCargaTrace[], detalles: Map<string, Pick<CargaTrace, 'filas'>>): Celda[][] {
  const filas: Celda[][] = [
    ['Fecha', 'Hora', 'Semana', 'Sold To', 'Ship To', 'Posición de muestreo', 'Equipo', 'pH', 'ORP (mV)', 'Temperatura (°C)', 'Archivo', 'Informe'],
  ]
  cargas.forEach((c) => {
    const equipo = c.equipo ? nombreEquipo(c.equipo) : null
    ;(detalles.get(c.carpeta)?.filas ?? []).forEach((f: FilaTrace) => {
      filas.push([f.fecha, f.hora, semanaIso(f.fecha), c.cliente, c.planta, c.ubicacion ?? null, equipo, f.ph, f.mv, f.temp, f.archivo, c.carpeta])
    })
  })
  return filas
}

/**
 * Pide las mediciones de cada carga (de a `paralelas` a la vez) y avisa cuántas van. Si una falla, la descarga
 * entera falla: un Excel con informes faltantes parecería completo y no lo está.
 */
export async function reunirDetalles(
  cargas: ResumenCargaTrace[],
  ver: (carpeta: string) => Promise<CargaTrace>,
  alAvanzar?: (hechas: number, total: number) => void,
  paralelas = 4,
): Promise<Map<string, CargaTrace>> {
  const salida = new Map<string, CargaTrace>()
  let siguiente = 0
  let hechas = 0
  async function trabajador() {
    while (siguiente < cargas.length) {
      const c = cargas[siguiente++]
      salida.set(c.carpeta, await ver(c.carpeta))
      alAvanzar?.(++hechas, cargas.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(paralelas, cargas.length) }, trabajador))
  return salida
}

/** pH y ORP de una carga, calculados de sus propias mediciones (no del resumen guardado). */
export function estadisticaDeFilas(filas: FilaTrace[], campo: 'ph' | 'mv') {
  const v = filas.map((f) => f[campo]).filter((x): x is number => x != null && !Number.isNaN(x))
  if (!v.length) return { n: 0, min: null, max: null, prom: null }
  return { n: v.length, min: Math.min(...v), max: Math.max(...v), prom: v.reduce((s, x) => s + x, 0) / v.length }
}
