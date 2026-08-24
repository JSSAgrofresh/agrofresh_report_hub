export type TipoListado = 'especie' | 'variedad'

export interface ValorLista {
  id: number
  tipo: TipoListado
  valor: string
  activo: boolean
  es_estandar: boolean
  fusionado_en_id: number | null
  /** Solo aplica a tipo=variedad: a qué especie pertenece -"June Gold" de
   * Durazno y "June Gold" de Manzana son filas distintas, cada una con su
   * propio especie_id, nunca se fusionan entre sí-. */
  especie_id: number | null
  creado_en: string
}

export interface ValorListaInput {
  valor: string
  activo: boolean
  /** Obligatorio al crear/editar un valor de tipo=variedad. */
  especie_id?: number | null
}

/** Grupo de valores parecidos: solo una AYUDA de revisión -nunca implica que
 * todo el grupo sea una única variedad-. El administrador decide cuántas
 * variedades estándar crea a partir de un grupo (ver EstandaresListado). */
export interface GrupoHomogenizacion {
  confianza: 'alta' | 'revisar'
  valores: { id: number; valor: string }[]
  valor_propuesto: string
}

export interface ValorAsignado {
  id: number
  valor: string
}

export interface EstandarListado {
  id: number
  valor: string
  activo: boolean
  valores_asignados: ValorAsignado[]
}

export interface EstandaresResponse {
  estandares: EstandarListado[]
  sin_asignar: ValorAsignado[]
}
