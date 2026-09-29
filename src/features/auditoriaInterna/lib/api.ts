import { httpClient } from '@/services/http/client'
import type { ContenidoCarpeta, SolicitudAuditoria } from './tipos'

const BASE = '/auditoria-interna'

export function listarSolicitudesAuditoria() {
  return httpClient.get<SolicitudAuditoria[]>(`${BASE}/solicitudes`)
}

/** `null` borra la fecha. Solo el admin general puede editarla. */
export function editarFechaEnvio(informeId: number, fechaEnvio: string | null) {
  return httpClient.patch<{ fecha_envio: string | null }>(`${BASE}/informes/${informeId}/fecha-envio`, {
    fecha_envio: fechaEnvio,
  })
}

export function listarCarpeta(ruta: string) {
  return httpClient.get<ContenidoCarpeta>(`${BASE}/carpetas?ruta=${encodeURIComponent(ruta)}`)
}

export function rutaPdfInforme(informeId: number) {
  return `${BASE}/informes/${informeId}/pdf`
}

export function rutaPdfArchivo(ruta: string) {
  return `${BASE}/carpetas/archivo?ruta=${encodeURIComponent(ruta)}`
}

/** Varios informes en un solo .zip; devuelve el archivo y el nombre que puso el backend. */
export function descargarZipInformes(rutas: string[], nombre?: string) {
  return httpClient.postArchivoConNombre(`${BASE}/carpetas/zip`, { rutas, nombre })
}

export function eliminarArchivo(ruta: string) {
  return httpClient.delete<{ ok: boolean }>(`${BASE}/carpetas/archivo?ruta=${encodeURIComponent(ruta)}`)
}

export function eliminarCarpeta(ruta: string) {
  return httpClient.delete<{ eliminados: number }>(`${BASE}/carpetas/carpeta?ruta=${encodeURIComponent(ruta)}`)
}

export function renombrarArchivo(ruta: string, nuevoNombre: string) {
  return httpClient.post<{ ruta: string }>(`${BASE}/carpetas/renombrar`, { ruta, nuevo_nombre: nuevoNombre })
}
