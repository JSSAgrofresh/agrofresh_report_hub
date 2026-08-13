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
