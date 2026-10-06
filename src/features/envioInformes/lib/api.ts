import { httpClient } from '@/services/http/client'
import type {
  AnalisisLote,
  DatosCorreo,
  Encabezado,
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

export function guardarEncabezado(encabezado: Encabezado) {
  return httpClient.put<EstadoEnvio>(`${BASE}/encabezado`, encabezado)
}

export function obtenerPlanDestinatarios(soldTo: string, shipTo: string, especie: string, servicio = '') {
  const qs = new URLSearchParams({ sold_to: soldTo, ship_to: shipTo, especie, servicio })
  return httpClient.get<PlanDestinatarios>(`${BASE}/lista?${qs.toString()}`)
}

/** Lee cada PDF (Sold To, Ship To, especie, servicio) y propone su lista. No envía nada. */
export function analizarInformes(archivos: File[]) {
  const form = new FormData()
  for (const archivo of archivos) form.append('archivos', archivo, archivo.name)
  return httpClient.upload<AnalisisLote>(`${BASE}/analizar`, form)
}

/** Solo el administrador principal, con su contraseña. */
export function desbloquearEdicion(password: string) {
  return httpClient.post<{ ok: boolean }>(`${BASE}/desbloquear`, { password })
}

/** Hoy hay una sola plantilla para todos: la clave `predeterminado`. */
export const PLANTILLA_PREDETERMINADA = 'predeterminado'

export function obtenerTemplateInforme(clave: string = PLANTILLA_PREDETERMINADA) {
  return httpClient.get<TemplateMail>(`${BASE}/template/${encodeURIComponent(clave)}`)
}

export function guardarTemplateInforme(clave: string, datos: { asunto: string; cuerpo: string }) {
  return httpClient.put<TemplateMail>(`${BASE}/template/${encodeURIComponent(clave)}`, datos)
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
  form.append('servicio', datos.servicio)
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

/** Solo el administrador principal; la pantalla pide además su contraseña. */
export function eliminarRegistroEnvio(id: number) {
  return httpClient.delete<{ estado: string }>(`${BASE}/historial/${id}`)
}

export interface AvisoClientes {
  asunto: string
  texto: string
  html: string
  destinatarios_prueba: string[]
}

/** El aviso de bienvenida a clientes, tal como lo verían. Solo lee. */
export function obtenerAvisoClientes() {
  return httpClient.get<AvisoClientes>(`${BASE}/aviso`)
}

/** Lo manda SOLO a Paz y Jorge, con «(PRUEBA)» en el asunto. */
export function enviarPruebaAviso() {
  return httpClient.post<{ ok: string; to: string[] }>(`${BASE}/aviso/enviar-prueba`, {})
}
