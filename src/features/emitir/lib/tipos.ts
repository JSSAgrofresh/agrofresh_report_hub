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

/** Datos del informe que no vienen del cruce solicitud+GC (quién analiza,
 * quién aprueba) y que quedan seteados en la app hasta que alguien los
 * cambie -por ejemplo, cuando la jefa de Cromatografía sale de vacaciones y
 * firma otra persona-. */
export interface InformeConfig {
  analizado_por_nombre: string
  analizado_por_cargo: string
  aprobado_por_nombre: string
  aprobado_por_cargo: string
}

export interface FilaSubida {
  nro_solicitud_original: string
  codigo_vial: string | null
  estado: 'creada' | 'ya_existia' | 'error'
  folio: string | null
  mensaje: string | null
}
