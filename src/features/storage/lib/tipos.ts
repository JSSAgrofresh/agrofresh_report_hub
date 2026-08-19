export type TipoEntradaStorage = 'carpeta' | 'archivo'

export interface EntradaStorage {
  nombre: string
  ruta: string
  tipo: TipoEntradaStorage
  tamano_bytes: number | null
  modificado: string
}

export interface ListadoStorage {
  ruta: string
  entradas: EntradaStorage[]
}
