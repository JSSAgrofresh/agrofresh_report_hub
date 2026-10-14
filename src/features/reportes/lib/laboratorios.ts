import { laboratorioBase } from './filtros'

/** Laboratorios cuyo resultado no es un residuo en ppm contra una franja: se ven en TABLA, nunca en los gráficos de Report. */
export type LaboratorioTabular = 'diagnofruit' | 'als'

/**
 * `'diagnofruit'` o `'als'` si `laboratorio` es uno de ellos (sin mayúsculas ni paréntesis: «ALS (Corthon)», «Als»
 * y «ALS» son el mismo), `null` si es de residuos (Quiteca, AgroFresh) o no hay laboratorio.
 */
export function laboratorioTabular(laboratorio: string | null | undefined): LaboratorioTabular | null {
  const base = laboratorioBase(laboratorio)
  return base === 'diagnofruit' || base === 'als' ? base : null
}
