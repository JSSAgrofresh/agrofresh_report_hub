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
