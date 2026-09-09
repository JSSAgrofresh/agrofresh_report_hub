export interface InfoTabla {
  nombre: string
  columnas: string[]
  total: number
}

export interface PaginaTabla {
  filas: Record<string, unknown>[]
  total: number
  pagina: number
  tamano: number
  columnas: string[]
}

export interface GrupoInconsistencia {
  regla: 'homogenizacion'
  tabla: string
  campo: string
  etiqueta: string
  clave: string
  conteo_variantes: Record<string, number>
  sugerido: string
  filas: number
}

export interface ResultadoAuditoria {
  schema: string
  total_inconsistencias: number
  total_filas_afectadas: number
  grupos: GrupoInconsistencia[]
}

export interface EstadoStaging {
  activo: boolean
  creado_en?: string | null
}

export interface CorregirGrupoInput {
  tabla: string
  campo: string
  clave: string
  valor: string
}

export interface ResultadoCorreccion {
  filas_actualizadas: number
  auditoria: ResultadoAuditoria
}

export interface EntradaHistorial {
  id: number
  tabla: string
  campo: string
  etiqueta: string
  valor_nuevo: string
  filas: number
  aplicado_en: string
  deshecho: boolean
}

export interface ResultadoDeshacer {
  filas_restauradas: number
  auditoria: ResultadoAuditoria
}

export interface ValorColumna {
  valor: string
  filas: number
}

export interface ValoresColumna {
  tabla: string
  campo: string
  schema: string
  valores: ValorColumna[]
}

export interface CorregirValoresInput {
  tabla: string
  campo: string
  valores_origen: string[]
  valor_destino: string
}

/** Un valor de Sold To/Ship To/Especie/Variedad que no calza con ningún
 * valor vigente de Listados -aunque esté escrito siempre igual dentro de la
 * base-. `contexto` es el Sold To (para ship_to_raw) o la Especie (para
 * variedad) al que pertenece; `null` para sold_to_raw/especie. */
export interface GrupoFueraDeListados {
  regla: 'fuera_de_listados'
  tabla: string
  campo: 'sold_to_raw' | 'ship_to_raw' | 'especie' | 'variedad'
  etiqueta: string
  contexto: string | null
  valores: string[]
  filas: number
  sugerido: string
  sugerencias: { valor: string; confianza: number }[]
}

export interface ResultadoAuditoriaListados {
  schema: string
  en_copia_de_trabajo: boolean
  total_inconsistencias: number
  total_filas_afectadas: number
  grupos: GrupoFueraDeListados[]
}
