export interface ResultadoAnalito {
  analito: string
  area: number | null
  amount: number | null
}

export interface MuestraGC {
  codigo: string
  seq_line: number | null
  fecha_inyeccion: string | null
  resultados: ResultadoAnalito[]
}

export interface FilaCruce {
  codigo: string
  archivo_solicitud: string | null
  seq_line: number | null
  fecha_inyeccion: string | null
  resultados: ResultadoAnalito[]
}
