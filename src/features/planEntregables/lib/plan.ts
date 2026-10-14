import type { ClientePlan } from './api'

/** Mismo criterio que el servidor (`plan_cruce.normalizar`): sin tildes, mayúsculas, sin puntos ni signos. */
export function normalizarNombre(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\./g, '')
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .join(' ')
}

export type FilaPlan = 'residuales' | 'fsma' | 'fito'

/** El plan por Sold To, buscable por el nombre sin importar tildes ni mayúsculas. */
export function indexarPlan(clientes: ClientePlan[]): Map<string, ClientePlan> {
  return new Map(clientes.map((c) => [normalizarNombre(c.sold_to), c]))
}

/** Lo prometido para una fila del gráfico; `null` si el plan no trae nada (no se juzga). */
export function cantidadPlan(plan: ClientePlan | undefined, fila: FilaPlan): number | null {
  const n = plan?.[fila] ?? 0
  return n > 0 ? n : null
}

/** Avance = lo que llevamos ÷ lo prometido. Puede pasar de 100%. */
export function avancePlan(hechos: number, prometido: number | null): number | null {
  return prometido && prometido > 0 ? hechos / prometido : null
}
