export type TipoEntradaStorage = 'carpeta' | 'archivo'

export interface EntradaStorage {
  nombre: string
  ruta: string
  tipo: TipoEntradaStorage
  tamano_bytes: number | null
  modificado: string
  /** La carpeta tiene su propia regla de acceso. */
  restringida?: boolean
  /** Cuántas cuentas la ven; solo lo recibe el admin general. */
  n_usuarios?: number | null
}

export interface ListadoStorage {
  ruta: string
  entradas: EntradaStorage[]
}

/** 'local' es el disco del servidor; 'r2' es el bucket (Solicitudes y Accutab). */
export type EspacioPermisos = 'local' | 'r2'

export interface PermisoCarpeta {
  espacio: EspacioPermisos
  ruta: string
  restringida: boolean
  usuario_ids: number[]
  heredada_de: string | null
  heredados_ids: number[]
  /** Con una carpeta contenedora restringida, solo esas cuentas se pueden elegir. */
  elegibles_ids: number[] | null
}

export interface ResumenPermiso {
  espacio: EspacioPermisos
  ruta: string
  usuarios: { id: number; nombre: string; email: string }[]
}
