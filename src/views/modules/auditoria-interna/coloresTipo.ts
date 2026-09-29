import { TIPO_ACTIMIST, TIPO_LINEA } from '@/features/auditoriaInterna'

/** Color por tipo de servicio: el mismo en todo el módulo. Validados juntos
 * (separación para daltonismo ΔE 13). Un tipo nuevo cae en gris. */
export const COLOR_TIPO: Record<string, string> = {
  [TIPO_ACTIMIST]: '#2a78d6',
  [TIPO_LINEA]: '#4a3aa7',
}
export const colorDeTipo = (tipo: string) => COLOR_TIPO[tipo] ?? '#6b7770'

/** Alto del gráfico por cliente: crece con la cantidad de clientes y de barras. */
export function altoClienteServicio(nClientes: number, nTipos: number): number {
  return Math.max(200, nClientes * (nTipos * 2 * 14 + 16) + 40)
}
