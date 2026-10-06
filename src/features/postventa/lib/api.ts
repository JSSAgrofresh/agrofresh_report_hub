import { httpClient } from '@/services/http/client'
import { descargarArchivo } from '@/services/http/descargar'

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
  /** Posición de muestreo (línea o sector donde está el equipo). */
  ubicacion?: string | null
  especie?: string | null
  equipo: string | null
  responsable: string | null
  n_registros: number
  ph_promedio: number | null
  mv_promedio: number | null
  tiene_pdf: boolean
  n_archivos: number
  origen: 'manual' | 'email'
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

/** Borra varias cargas de una vez; devuelve las que se borraron y las que no existían. */
export function eliminarCargasTrace(carpetas: string[]) {
  return httpClient.post<{ borradas: string[]; fallidas: string[] }>('/postventa/registros/eliminar', { carpetas })
}

/** Genera el informe PDF de una carga que todavía no lo tiene. */
export function generarInformeCarga(carpeta: string) {
  return httpClient.post<{ ok: boolean }>(`/postventa/registros/${encodeURIComponent(carpeta)}/informe`, {})
}

/** Portal de cliente: los informes con PDF de la cuenta (el servidor acota por su cliente y sucursal). */
export function listarInformesCliente() {
  return httpClient.get<ResumenCargaTrace[]>('/postventa/cliente/informes')
}

/** Abre el PDF en una pestaña nueva (lleva el token, por eso no es un enlace directo). */
export async function verPdfCliente(carpeta: string): Promise<void> {
  const { blob } = await httpClient.getArchivoConNombre(`/postventa/cliente/informes/${encodeURIComponent(carpeta)}/pdf`)
  const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }))
  window.open(url, '_blank', 'noopener')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function descargarPdfCliente(carpeta: string) {
  return descargarArchivo(`/postventa/cliente/informes/${encodeURIComponent(carpeta)}/pdf`, `Informe_Accutab_${carpeta}.pdf`)
}

export function descargarPdfCarga(carpeta: string) {
  return descargarArchivo(`/postventa/registros/${encodeURIComponent(carpeta)}/pdf`, `${carpeta}.pdf`)
}

export function descargarOriginalCarga(carpeta: string, nombre: string) {
  return descargarArchivo(
    `/postventa/registros/${encodeURIComponent(carpeta)}/originales/${encodeURIComponent(nombre)}`,
    nombre,
  )
}

/** "2026-08-24_14-32-07" -> "24-08-2026 14:32". El nombre de la carpeta es la
 * fecha real del guardado, así que no hace falta parsear el ISO para mostrarla. */
export function fechaDeCarpeta(carpeta: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-\d{2}$/.exec(carpeta)
  if (!m) return carpeta
  const [, a, mes, d, h, min] = m
  return `${d}-${mes}-${a} ${h}:${min}`
}
