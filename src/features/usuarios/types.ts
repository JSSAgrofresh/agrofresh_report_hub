import type { AreaId } from '@/constants/areas'

export type TipoAcceso = 'admin_general' | 'admin_area' | 'cliente' | 'muestreador'

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
  /** Módulos asignados manualmente. Los usuarios antiguos sin esta propiedad
   * conservan los permisos predeterminados de su rol y área. */
  modulos?: string[]
  /** Secciones habilitadas dentro del módulo Report. */
  reportes?: Array<'laboratorio' | 'postventa' | 'emitir'>
}
