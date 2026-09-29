import { httpClient } from '@/services/http/client'
import { descargarArchivo } from '@/services/http/descargar'
import type {
  EntradaStorage,
  EspacioPermisos,
  ListadoStorage,
  PermisoCarpeta,
  ResumenPermiso,
} from './tipos'

export function listar(ruta = '') {
  const query = ruta ? `?ruta=${encodeURIComponent(ruta)}` : ''
  return httpClient.get<ListadoStorage>(`/storage/listar${query}`)
}

export function crearCarpeta(rutaPadre: string, nombre: string) {
  return httpClient.post<EntradaStorage>('/storage/carpetas', { ruta_padre: rutaPadre, nombre })
}

export function subirArchivos(ruta: string, archivos: File[]) {
  const formData = new FormData()
  formData.append('ruta', ruta)
  archivos.forEach((a) => formData.append('archivos', a))
  return httpClient.upload<EntradaStorage[]>('/storage/subir', formData)
}

export function renombrar(ruta: string, nombreNuevo: string) {
  return httpClient.put<EntradaStorage>('/storage/renombrar', { ruta, nombre_nuevo: nombreNuevo })
}

export function mover(ruta: string, rutaDestino: string) {
  return httpClient.put<EntradaStorage>('/storage/mover', { ruta, ruta_destino: rutaDestino })
}

export function eliminar(ruta: string) {
  return httpClient.delete<{ estado: string }>(`/storage/eliminar?ruta=${encodeURIComponent(ruta)}`)
}

export function descargar(ruta: string) {
  return descargarArchivo(`/storage/descargar?ruta=${encodeURIComponent(ruta)}`, ruta.split('/').pop() || 'archivo')
}

// ---------------------------------------------------------------------------
// R2 (solo lectura)
// ---------------------------------------------------------------------------

export function listarR2(prefijo = '') {
  const query = prefijo ? `?prefijo=${encodeURIComponent(prefijo)}` : ''
  return httpClient.get<ListadoStorage>(`/storage/r2/listar${query}`)
}

export function descargarR2(key: string) {
  return descargarArchivo(`/storage/r2/descargar?key=${encodeURIComponent(key)}`, key.split('/').pop() || 'archivo')
}

export function organizarSolicitudesR2() {
  return httpClient.post<{ movidas: number; omitidas: number }>(
    '/toma-muestras/solicitudes/organizar-r2',
    {},
  )
}

// ---------------------------------------------------------------------------
// Permisos por carpeta (solo admin general)
// ---------------------------------------------------------------------------

export function verPermisos(espacio: EspacioPermisos, ruta: string) {
  const query = `?espacio=${espacio}&ruta=${encodeURIComponent(ruta)}`
  return httpClient.get<PermisoCarpeta>(`/storage/permisos${query}`)
}

export function guardarPermisos(espacio: EspacioPermisos, ruta: string, usuarioIds: number[]) {
  return httpClient.put<PermisoCarpeta>('/storage/permisos', {
    espacio,
    ruta,
    usuario_ids: usuarioIds,
  })
}

export function resumenPermisos() {
  return httpClient.get<ResumenPermiso[]>('/storage/permisos/resumen')
}

// ---------------------------------------------------------------------------
// R2: escritura y búsqueda
// ---------------------------------------------------------------------------

export function crearCarpetaR2(rutaPadre: string, nombre: string) {
  return httpClient.post<EntradaStorage>('/storage/r2/carpetas', { ruta_padre: rutaPadre, nombre })
}

export function subirArchivosR2(ruta: string, archivos: File[]) {
  const formData = new FormData()
  formData.append('ruta', ruta)
  archivos.forEach((a) => formData.append('archivos', a))
  return httpClient.upload<EntradaStorage[]>('/storage/r2/subir', formData)
}

export function renombrarR2(ruta: string, nombreNuevo: string) {
  return httpClient.put<EntradaStorage>('/storage/r2/renombrar', { ruta, nombre_nuevo: nombreNuevo })
}

export function moverR2(ruta: string, rutaDestino: string) {
  return httpClient.put<EntradaStorage>('/storage/r2/mover', { ruta, ruta_destino: rutaDestino })
}

export function eliminarR2(ruta: string) {
  return httpClient.delete<{ estado: string }>(`/storage/r2/eliminar?ruta=${encodeURIComponent(ruta)}`)
}

export function buscar(q: string, espacio: EspacioPermisos) {
  return httpClient.get<EntradaStorage[]>(
    `/storage/buscar?q=${encodeURIComponent(q)}&espacio=${espacio}`,
  )
}

/** El archivo entero, para la vista previa (no lo baja al disco). */
export function abrirArchivo(r2: boolean, ruta: string) {
  const path = r2
    ? `/storage/r2/descargar?key=${encodeURIComponent(ruta)}`
    : `/storage/descargar?ruta=${encodeURIComponent(ruta)}`
  return httpClient.getArchivoConNombre(path)
}
