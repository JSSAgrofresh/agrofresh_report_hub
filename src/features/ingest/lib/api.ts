import { httpClient } from '@/services/http/client'
import type { FilaIngest } from './homogenizar'

export interface ResumenCarga {
  solicitudes_nuevas: number
  solicitudes_existentes: number
  clientes_nuevos: number
  plantas_nuevas: number
  productos_aplicados: number
  resultados: number
  filas_omitidas: number
}

export interface DetalleFilaCarga {
  fila: number
  nro_solicitud?: string
  solicitud_id?: number | null
  cliente?: string | null
  planta?: string | null
  productos_aplicados?: number
  resultados?: number
  omitida?: boolean
  motivos: string[]
}

export interface RespuestaCarga {
  resumen: ResumenCarga
  detalle: DetalleFilaCarga[]
  advertencias: string[]
  modo: 'preview' | 'confirmado'
}

export function previsualizarCarga(filas: FilaIngest[]) {
  return httpClient.post<RespuestaCarga>('/ingest/preview', { filas })
}

export function confirmarCarga(filas: FilaIngest[]) {
  return httpClient.post<RespuestaCarga>('/ingest/confirmar', { filas })
}
