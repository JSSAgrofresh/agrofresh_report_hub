import type { AreaId } from '@/constants/areas'

export type TipoAcceso = 'admin_general' | 'admin_area' | 'analista' | 'cliente' | 'muestreador' | 'gerencia' | 'comercial'

export interface PlantaAsignada {
  clienteNombre: string
  plantaNombre?: string | null
  /** Solo ve esta especie de la planta; sin especie = todas. Una fila por especie. */
  especie?: string | null
}

export interface Usuario {
  id: string
  email: string
  nombre: string
  tipoAcceso: TipoAcceso
  /** requerida para admin_area, analista y cliente */
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
  reportes?: Array<'laboratorio' | 'postventa'>
  /** Comercial (obligatoria) o cliente con varios accesos: las plantas y especies que ve. Sin plantaNombre = todas las de ese Sold To. */
  plantasAsignadas?: PlantaAsignada[]
  /** La contraseña actual se la puso un administrador: hay que cambiarla
   * antes de poder usar el sistema. */
  debeCambiarPassword?: boolean
}
