export type TipoListado = 'especie' | 'variedad'

export interface ValorLista {
  id: number
  tipo: TipoListado
  valor: string
  activo: boolean
  fusionado_en_id: number | null
  creado_en: string
}

export interface ValorListaInput {
  valor: string
  activo: boolean
}

export interface GrupoHomogenizacion {
  confianza: 'alta' | 'revisar'
  valores: { id: number; valor: string }[]
  valor_propuesto: string
}
