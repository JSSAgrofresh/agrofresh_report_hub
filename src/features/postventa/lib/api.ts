import { httpClient } from '@/services/http/client'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'

/** Una medición ya normalizada y unificada pH+ORP, tal como la deja Trace. */
export interface FilaTrace {
  ts: number
  fecha: string
  hora: string
  modo: string | null
  ph: number | null
  mv: number | null
  temp: number | null
  archivo: string
  /** Minutos de diferencia entre la medición de pH y la de ORP que se parearon. */
  desfase: number | null
}

export interface EstadisticaSerie {
  min: number | null
  max: number | null
  prom: number | null
  desv: number | null
  rMin: number | null
  rMax: number | null
}

export interface EstadisticasTrace {
  n: number
  ph: EstadisticaSerie
  mv: EstadisticaSerie
}

/** Lo que se muestra en la lista de cargas, sin traer todas las filas. */
export interface ResumenCargaTrace {
  carpeta: string
  guardado_en: string | null
  cliente: string | null
  planta: string | null
  equipo: string | null
  responsable: string | null
  n_registros: number
  ph_promedio: number | null
  mv_promedio: number | null
  tiene_pdf: boolean
  n_archivos: number
}

export interface CargaTrace extends ResumenCargaTrace {
  limites: Record<string, number | null> | null
  estadisticas: EstadisticasTrace | null
  filas: FilaTrace[]
  archivos: string[]
}

export function listarCargasTrace() {
  return httpClient.get<ResumenCargaTrace[]>('/postventa/registros')
}

export function verCargaTrace(carpeta: string) {
  return httpClient.get<CargaTrace>(`/postventa/registros/${encodeURIComponent(carpeta)}`)
}

export function eliminarCargaTrace(carpeta: string) {
  return httpClient.delete<{ ok: boolean }>(`/postventa/registros/${encodeURIComponent(carpeta)}`)
}

/** Descargas directas (GET), igual que el resto de las descargas de la app. */
export function urlPdfCarga(carpeta: string) {
  return `${API_BASE_URL}/postventa/registros/${encodeURIComponent(carpeta)}/pdf`
}

export function urlOriginalCarga(carpeta: string, nombre: string) {
  return `${API_BASE_URL}/postventa/registros/${encodeURIComponent(carpeta)}/originales/${encodeURIComponent(nombre)}`
}

/** "2026-08-24_14-32-07" -> "24-08-2026 14:32". El nombre de la carpeta es la
 * fecha real del guardado, así que no hace falta parsear el ISO para mostrarla. */
export function fechaDeCarpeta(carpeta: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-\d{2}$/.exec(carpeta)
  if (!m) return carpeta
  const [, a, mes, d, h, min] = m
  return `${d}-${mes}-${a} ${h}:${min}`
}
