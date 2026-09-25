export interface Estadisticas {
  promedio: number | null
  desviacion: number
  n: number
}

export function calcularEstadisticas(valores: number[]): Estadisticas {
  const n = valores.length
  const promedio = n ? valores.reduce((a, b) => a + b, 0) / n : null
  const varianza =
    n > 1 && promedio != null ? valores.reduce((s, x) => s + (x - promedio) ** 2, 0) / (n - 1) : 0
  return { promedio, desviacion: Math.sqrt(varianza), n }
}

export interface Limites {
  inferior: number | null
  central: number | null
  superior: number | null
}

/** Límites de control: promedio ± sigma desviaciones estándar sobre los datos filtrados. */
export function calcularLimitesControl(valores: number[], sigma: number): Limites & { stats: Estadisticas } {
  const stats = calcularEstadisticas(valores)
  const { promedio, desviacion } = stats
  return {
    inferior: promedio == null ? null : promedio - sigma * desviacion,
    central: promedio,
    superior: promedio == null ? null : promedio + sigma * desviacion,
    stats,
  }
}

export interface Cumplimiento {
  ok: number
  fuera: number
  total: number
  porcentaje: number | null
}

/** Cumplimiento contra un límite residual máximo. Sin límite definido, no se puede evaluar. */
export function calcularCumplimiento(valores: number[], limiteMax: number | null): Cumplimiento {
  const total = valores.length
  if (limiteMax == null || total === 0) return { ok: 0, fuera: 0, total, porcentaje: null }
  const ok = valores.filter((v) => v <= limiteMax).length
  return { ok, fuera: total - ok, total, porcentaje: (ok / total) * 100 }
}

/** Cuántas observaciones caen fuera del intervalo [inferior, superior]. */
export function contarFueraDeIntervalo(valores: number[], inferior: number | null, superior: number | null) {
  if (inferior == null || superior == null) return { dentro: valores.length, fuera: 0 }
  let fuera = 0
  valores.forEach((v) => {
    if (v < inferior || v > superior) fuera++
  })
  return { dentro: valores.length - fuera, fuera }
}

export interface TramoHistograma {
  desde: number
  hasta: number
  conteo: number
}

/** Reparte los valores en tramos del mismo ancho entre el mínimo y el máximo.
 * El último tramo incluye el máximo. Con todos los valores iguales sale un
 * solo tramo. Cantidad por defecto: raíz de n, entre 1 y 12 tramos. */
export function histograma(valores: number[], tramos?: number): TramoHistograma[] {
  if (valores.length === 0) return []
  let min = Infinity
  let max = -Infinity
  valores.forEach((v) => {
    if (v < min) min = v
    if (v > max) max = v
  })
  if (min === max) return [{ desde: min, hasta: max, conteo: valores.length }]
  const n = Math.max(1, Math.min(12, tramos ?? Math.ceil(Math.sqrt(valores.length))))
  const ancho = (max - min) / n
  const res: TramoHistograma[] = Array.from({ length: n }, (_, i) => ({
    desde: min + i * ancho,
    hasta: i === n - 1 ? max : min + (i + 1) * ancho,
    conteo: 0,
  }))
  valores.forEach((v) => {
    const i = Math.min(n - 1, Math.floor((v - min) / ancho))
    res[i].conteo++
  })
  return res
}
