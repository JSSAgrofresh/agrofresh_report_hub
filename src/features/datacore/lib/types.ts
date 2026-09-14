export type EstadoCelda = 'exacto' | 'homogenizado' | 'sin_match' | 'vacio'

export interface Sugerencia {
  valor: string
  confianza: number
}

export interface CeldaValidada {
  crudo: string | null
  canonico: string | null
  estado: EstadoCelda
  sugerencias: Sugerencia[]
}

export interface FilaValidada {
  n: number
  nro_informe: string | null
  sold_to: CeldaValidada
  ship_to: CeldaValidada
  especie: CeldaValidada
  variedad: CeldaValidada
  valida: boolean
}

export interface ResumenValidacion {
  total: number
  validas: number
  con_errores: number
}

export interface ResultadoValidacion {
  filas: FilaValidada[]
  resumen: ResumenValidacion
}
