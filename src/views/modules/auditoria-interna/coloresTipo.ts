import { TIPO_ACTIMIST, TIPO_LINEA } from '@/features/auditoriaInterna'

/** Color por tipo de servicio: el mismo en todo el módulo. Validados juntos
 * (separación para daltonismo ΔE 13). Un tipo nuevo cae en gris. */
export const COLOR_TIPO: Record<string, string> = {
  [TIPO_ACTIMIST]: '#2a78d6',
  [TIPO_LINEA]: '#4a3aa7',
}
export const colorDeTipo = (tipo: string) => COLOR_TIPO[tipo] ?? '#6b7770'

/**
 * Las donas por tipo de servicio: el color es el del tipo (azul / violeta) y el
 * estado se lee por el tono -oscuro = concretadas, medio = PDF sin Report,
 * claro = pendientes-. Cada rampa se validó como ordinal (un solo tono, claro→
 * oscuro con saltos visibles, y el extremo claro se separa del fondo). Los
 * números están siempre en la leyenda: el color no lleva el dato solo.
 */
export const TONOS_TIPO: Record<string, { concretada: string; sin_report: string; pendiente: string }> = {
  [TIPO_ACTIMIST]: { concretada: '#2a78d6', sin_report: '#5f9ae0', pendiente: '#8ab5e8' },
  [TIPO_LINEA]: { concretada: '#4a3aa7', sin_report: '#776bbd', pendiente: '#9b93cf' },
}
const TONOS_GRIS = { concretada: '#5b665f', sin_report: '#8a958e', pendiente: '#b3bbb6' }
export const tonosDeTipo = (tipo: string) => TONOS_TIPO[tipo] ?? TONOS_GRIS

/** Alto del gráfico por cliente: crece con la cantidad de clientes y de barras. */
export function altoClienteServicio(nClientes: number, nTipos: number): number {
  return Math.max(200, nClientes * (nTipos * 2 * 14 + 16) + 40)
}
