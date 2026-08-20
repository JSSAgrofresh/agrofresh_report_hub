import type { AreaId } from '@/constants/areas'

export type TipoAcceso = 'admin_general' | 'admin_area' | 'cliente'

export interface Usuario {
  id: string
  email: string
  nombre: string
  tipoAcceso: TipoAcceso
  /** requerida para admin_area y cliente */
  area?: AreaId
  /** requerida para cliente: nombre de la empresa/cuenta a la que ve sus datos */
  clienteNombre?: string
  /** opcional para cliente: si se define, la cuenta ve solo esta sucursal (Ship
   * To) del cliente en vez del Sold To completo -ej. "Dole Codegua" vs "Dole
   * Molina" como cuentas separadas dentro de "DOLE CHILE S.A."-. */
  plantaNombre?: string
}
