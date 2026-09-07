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
  /** Fila con datos pero sin N° Informe: no se descarta, queda como conflicto
   * en Data Core hasta que alguien le asigne un N° Informe o la descarte. */
  conflictos_sin_informe?: number
  /** Mismo N° Informe repetido más de una vez dentro del mismo Excel. */
  duplicados_en_archivo?: number
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
  /** true si esta fila específica es el conflicto "tiene datos pero no N° Informe". */
  sin_informe?: boolean
  motivos: string[]
}

export interface ResultadoValidacionEstructura {
  valido: boolean
  errores: string[]
  advertencias: string[]
}

/** Paso 1 de Cargar Datos: valida los encabezados contra la plantilla oficial
 * de 69 columnas. Es solo una ayuda visual -no bloquea preview/confirmar-,
 * así que un Excel del formato antiguo puede seguir usándose igual aunque no
 * pase esta validación. */
export function validarEstructuraExcel(columnas: string[]) {
  return httpClient.post<ResultadoValidacionEstructura>('/ingest/validar-estructura', { columnas })
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

export interface SugerenciaFuzzy {
  valor: string
  confianza: number
}

export interface MotivoPendiente {
  campo: string
  etiqueta: string
  valor: string
  /** Posibles valores oficiales parecidos -nunca asignados solos, son solo
   * para que el administrador elija con un clic en vez de tipear-. */
  sugerencias?: SugerenciaFuzzy[]
}

export interface Pendiente {
  id: number
  origen: 'ingest' | 'converter'
  fila: Record<string, unknown>
  motivos: MotivoPendiente[]
  creado_en: string
}

export interface PaginaPendientes {
  filas: Pendiente[]
  total: number
  pagina: number
  tamano: number
}

export function listarPendientes(pagina = 1, tamano = 50) {
  return httpClient.get<PaginaPendientes>(`/ingest/pendientes?pagina=${pagina}&tamano=${tamano}`)
}

export function aprobarPendiente(id: number, correcciones?: Record<string, string>) {
  return httpClient.post<RespuestaCarga>(`/ingest/pendientes/${id}/aprobar`, { correcciones: correcciones ?? null })
}

export function descartarPendiente(id: number) {
  return httpClient.post<{ ok: boolean }>(`/ingest/pendientes/${id}/descartar`, {})
}

export function aprobarLotePendientes(ids?: number[]) {
  return httpClient.post<{ aprobados: number; resumen: ResumenCarga }>('/ingest/pendientes/aprobar-lote', {
    ids: ids ?? null,
  })
}

export function descartarLotePendientes(ids?: number[]) {
  return httpClient.post<{ descartados: number }>('/ingest/pendientes/descartar-lote', { ids: ids ?? null })
}

export function reintentarPendientes(ids?: number[]) {
  return httpClient.post<{ reintentados: number; resueltos: number; resumen: ResumenCarga }>(
    '/ingest/pendientes/reintentar',
    { ids: ids ?? null },
  )
}
