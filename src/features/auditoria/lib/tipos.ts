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
