import { httpClient } from '@/services/http/client'
import type { Definicion, ReglasEntrega, RespuestaHitos } from './entrega'
import type { SolicitudAuditoria } from './tipos'

const BASE = '/auditoria-interna'

export function listarSolicitudesAuditoria() {
  return httpClient.get<SolicitudAuditoria[]>(`${BASE}/solicitudes`)
}

/** Las fechas de cada hito de cada solicitud real (lead time y cumplimiento). */
export function leerHitosEntrega() {
  return httpClient.get<RespuestaHitos>(`${BASE}/hitos`)
}

export function leerReglasEntrega() {
  return httpClient.get<ReglasEntrega>(`${BASE}/plazos`)
}

/** Solo el admin general. `plazos`: laboratorio -> días; `null` quita el plazo. */
export function guardarReglasEntrega(entregado: Definicion, plazos: Record<string, number | null>) {
  return httpClient.put<ReglasEntrega>(`${BASE}/plazos`, { entregado, plazos })
}

/** `null` borra la fecha. Solo el admin general puede editarla. */
export function editarFechaEnvio(informeId: number, fechaEnvio: string | null) {
  return httpClient.patch<{ fecha_envio: string | null }>(`${BASE}/informes/${informeId}/fecha-envio`, {
    fecha_envio: fechaEnvio,
  })
}

export function rutaPdfInforme(informeId: number) {
  return `${BASE}/informes/${informeId}/pdf`
}
