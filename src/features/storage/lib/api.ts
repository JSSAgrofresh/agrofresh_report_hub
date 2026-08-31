import { httpClient } from '@/services/http/client'
import { descargarArchivo } from '@/services/http/descargar'
import type { EntradaStorage, ListadoStorage } from './tipos'

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
