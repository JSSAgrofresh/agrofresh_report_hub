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
  pendientes_revision: number
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
  pendiente_revision?: boolean
  motivos: string[]
}

export interface RespuestaCarga {
  resumen: ResumenCarga
  detalle: DetalleFilaCarga[]
  advertencias: string[]
  modo: 'preview' | 'confirmado'
}

export function previsualizarCarga(filas: FilaIngest[]) {
  return httpClient.post<RespuestaCarga>('/ingest/preview', { filas, origen: 'ingest' })
}

export function confirmarCarga(filas: FilaIngest[]) {
  return httpClient.post<RespuestaCarga>('/ingest/confirmar', { filas, origen: 'ingest' })
}

export interface MotivoPendiente {
  campo: string
  etiqueta: string
  valor: string
}

export interface Pendiente {
  id: number
  origen: 'ingest' | 'converter'
  fila: Record<string, unknown>
  motivos: MotivoPendiente[]
  creado_en: string
}

export function listarPendientes() {
  return httpClient.get<Pendiente[]>('/ingest/pendientes')
}

export function aprobarPendiente(id: number, correcciones?: Record<string, string>) {
  return httpClient.post<RespuestaCarga>(`/ingest/pendientes/${id}/aprobar`, { correcciones: correcciones ?? null })
}

export function descartarPendiente(id: number) {
  return httpClient.post<{ ok: boolean }>(`/ingest/pendientes/${id}/descartar`, {})
}
