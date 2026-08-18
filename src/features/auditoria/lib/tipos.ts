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
  variantes: string[]
  filas: number
}

export interface ResultadoAuditoria {
  total_inconsistencias: number
  total_filas_afectadas: number
  grupos: GrupoInconsistencia[]
}
