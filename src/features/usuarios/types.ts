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
}
