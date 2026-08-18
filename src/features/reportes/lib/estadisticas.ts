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
