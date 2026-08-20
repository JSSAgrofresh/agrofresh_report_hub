export interface ResultadoAnalito {
  analito: string
  codigo: string | null
  area: number | null
  amount: number | null
}

export interface MuestraGC {
  codigo: string
  seq_line: number | null
  fecha_inyeccion: string | null
  resultados: ResultadoAnalito[]
}

export interface Solicitud {
  archivo: string
  campos: Record<string, string>
  analitos_solicitados: string[]
}

export interface FilaCruce {
  campos: Record<string, string>
  analitos_solicitados: string[]
  resultados_por_codigo: Record<string, number | null>
  codigo_vial?: string | null
  fecha_inyeccion?: string | null
}
