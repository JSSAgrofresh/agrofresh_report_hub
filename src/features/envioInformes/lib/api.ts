import { httpClient } from '@/services/http/client'
import type {
  DatosCorreo,
  EstadoEnvio,
  Historial,
  Internos,
  ModoEnvio,
  PlanDestinatarios,
  ResultadoEnvio,
  TemplateMail,
  VistaPrevia,
} from './tipos'

const BASE = '/envio-informes'

export function obtenerEstadoEnvio() {
  return httpClient.get<EstadoEnvio>(`${BASE}/estado`)
}

/** Pasar a producción pide la contraseña; volver a prueba, no. */
export function cambiarModoEnvio(modo: ModoEnvio, password?: string) {
  return httpClient.put<EstadoEnvio>(`${BASE}/modo`, { modo, password })
}

export function guardarInternos(internos: Internos) {
  return httpClient.put<EstadoEnvio>(`${BASE}/internos`, internos)
}

export function obtenerPlanDestinatarios(soldTo: string, shipTo: string, especie: string) {
  const qs = new URLSearchParams({ sold_to: soldTo, ship_to: shipTo, especie })
  return httpClient.get<PlanDestinatarios>(`${BASE}/lista?${qs.toString()}`)
}

export function obtenerTemplateInforme(laboratorio: string) {
  return httpClient.get<TemplateMail>(`${BASE}/template/${encodeURIComponent(laboratorio)}`)
}

export function guardarTemplateInforme(laboratorio: string, datos: { asunto: string; cuerpo: string }) {
  return httpClient.put<TemplateMail>(`${BASE}/template/${encodeURIComponent(laboratorio)}`, datos)
}

export function vistaPreviaInforme(datos: DatosCorreo, nombresAdjuntos: string[]) {
  return httpClient.post<VistaPrevia>(`${BASE}/vista-previa`, { ...datos, nombres_adjuntos: nombresAdjuntos })
}

export function enviarInforme(datos: DatosCorreo, archivos: File[]) {
  const form = new FormData()
  form.append('laboratorio', datos.laboratorio)
  form.append('sold_to', datos.sold_to)
  form.append('ship_to', datos.ship_to)
  form.append('especie', datos.especie)
  form.append('asunto', datos.asunto ?? '')
  form.append('cuerpo', datos.cuerpo ?? '')
  form.append('para', JSON.stringify(datos.para))
  form.append('cc', JSON.stringify(datos.cc))
  form.append('bcc', JSON.stringify(datos.bcc))
  for (const archivo of archivos) form.append('archivos', archivo, archivo.name)
  return httpClient.upload<ResultadoEnvio>(`${BASE}/enviar`, form)
}

export function historialEnvios(limite = 40) {
  return httpClient.get<Historial>(`${BASE}/historial?limite=${limite}`)
}
