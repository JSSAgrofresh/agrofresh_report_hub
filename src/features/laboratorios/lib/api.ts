import { httpClient } from '@/services/http/client'
import type {
  Analisis,
  AnalisisInput,
  Contacto,
  ContactoInput,
  ResumenLaboratorio,
  Unidad,
  UnidadInput,
} from './tipos'

const BASE = '/laboratorios'

/** Los laboratorios, sus analitos y sus categorías siguen sirviéndose desde
 * `/toma-muestras/config/*`: son los mismos datos que consume el formulario
 * de solicitud y no se duplican acá. Este módulo cubre solo lo que vive
 * dentro de un laboratorio. */

export function resumenLaboratorios() {
  return httpClient.get<ResumenLaboratorio[]>(`${BASE}/resumen`)
}

// --- Unidades de medida ------------------------------------------------------

export function listarUnidades() {
  return httpClient.get<Unidad[]>(`${BASE}/unidades`)
}

export function crearUnidad(datos: UnidadInput) {
  return httpClient.post<Unidad>(`${BASE}/unidades`, datos)
}

export function actualizarUnidad(id: number, datos: UnidadInput) {
  return httpClient.put<Unidad>(`${BASE}/unidades/${id}`, datos)
}

export function eliminarUnidad(id: number) {
  return httpClient.delete<{ estado: string }>(`${BASE}/unidades/${id}`)
}

// --- Contactos ---------------------------------------------------------------

export function listarContactos(laboratorio?: string) {
  const query = laboratorio ? `?laboratorio=${encodeURIComponent(laboratorio)}` : ''
  return httpClient.get<Contacto[]>(`${BASE}/contactos${query}`)
}

export function crearContacto(datos: ContactoInput) {
  return httpClient.post<Contacto>(`${BASE}/contactos`, datos)
}

export function actualizarContacto(id: number, datos: ContactoInput) {
  return httpClient.put<Contacto>(`${BASE}/contactos/${id}`, datos)
}

export function eliminarContacto(id: number) {
  return httpClient.delete<{ estado: string }>(`${BASE}/contactos/${id}`)
}

// --- Análisis ----------------------------------------------------------------

export function listarAnalisis(laboratorio?: string) {
  const query = laboratorio ? `?laboratorio=${encodeURIComponent(laboratorio)}` : ''
  return httpClient.get<Analisis[]>(`${BASE}/analisis${query}`)
}

export function crearAnalisis(datos: AnalisisInput) {
  return httpClient.post<Analisis>(`${BASE}/analisis`, datos)
}

export function actualizarAnalisis(id: number, datos: AnalisisInput) {
  return httpClient.put<Analisis>(`${BASE}/analisis/${id}`, datos)
}

export function eliminarAnalisis(id: number) {
  return httpClient.delete<{ estado: string }>(`${BASE}/analisis/${id}`)
}
