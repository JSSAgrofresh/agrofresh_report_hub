export interface CargaReciente {
  id: string
  modulo: string
  detalle: string
  fecha: string
}

export type SeveridadAlerta = 'info' | 'advertencia'

export interface AlertaProceso {
  id: string
  modulo: string
  mensaje: string
  severidad: SeveridadAlerta
}

export interface ResumenDashboard {
  pendientesRevision: number
  ultimasCargas: CargaReciente[]
  alertas: AlertaProceso[]
}

export interface ReporteEnviado {
  id: string
  detalle: string
  fecha: string
}

export interface ResumenArea {
  totalRegistros2026: number
  registrosUltimaSemana: number
  reportesEnviados: ReporteEnviado[]
}

// ── Dashboard analítico ────────────────────────────────────────────────

export interface UsuarioActivo {
  nombre: string
  area: string | null
  tipo_acceso: string
  ultimo_uso: string
}

export interface ConverterReciente {
  id: number
  origen: string
  creado_en: string | null
  n_motivos: number
}

export interface TraceReciente {
  carpeta: string
  cliente: string
  equipo: string
  responsable: string
  tiene_pdf: boolean
}

export interface SolicitudReciente {
  id: number
  nro_solicitud: string | null
  fecha_entrada: string | null
  especie: string
  variedad: string
  laboratorio: string
  cliente: string
  planta: string
}

export interface VerificacionReciente {
  fecha: string
  resultado: string
  actualizado_en: string | null
}

export interface MetricasDashboard {
  total_solicitudes: number
  esta_semana: number
  pendientes_converter: number
  verificacion_hoy: boolean
}

export interface ActividadDashboard {
  usuarios_activos: UsuarioActivo[]
  converter_recientes: ConverterReciente[]
  trace_recientes: TraceReciente[]
  solicitudes_recientes: SolicitudReciente[]
  verificaciones_recientes: VerificacionReciente[]
  metricas: MetricasDashboard
}
