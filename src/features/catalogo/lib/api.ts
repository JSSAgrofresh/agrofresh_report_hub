import { httpClient } from '@/services/http/client'
import type { Servicio, ServicioConListado } from '@/lib/servicio'
import type { Cliente, ClienteInput, Planta, PlantaInput, PlanImportacionActimist } from './tipos'

/**
 * Cada servicio tiene su listado: Línea de proceso en `/catalogo` (el de
 * siempre, que también leen Ingesta, Converter y Report) y Actimist en
 * `/catalogo/actimist`; Ecofog (copia de Actimist) en `/catalogo/ecofog`. Sin servicio, todo va al de Línea de proceso.
 */
function base(servicio: Servicio = 'linea') {
  return servicio === 'linea' ? '/catalogo' : `/catalogo/${servicio}`
}

export function listarClientes(servicio: Servicio = 'linea') {
  return httpClient.get<Cliente[]>(`${base(servicio)}/clientes`)
}

export function crearCliente(datos: ClienteInput, servicio: Servicio = 'linea') {
  return httpClient.post<{ id: number }>(`${base(servicio)}/clientes`, datos)
}

export function editarCliente(id: number, datos: ClienteInput, servicio: Servicio = 'linea') {
  return httpClient.put<{ estado: string }>(`${base(servicio)}/clientes/${id}`, datos)
}

export function listarPlantas(servicio: Servicio = 'linea') {
  return httpClient.get<Planta[]>(`${base(servicio)}/plantas`)
}

export function crearPlanta(datos: PlantaInput, servicio: Servicio = 'linea') {
  return httpClient.post<{ id: number }>(`${base(servicio)}/plantas`, datos)
}

export function editarPlanta(id: number, datos: PlantaInput, servicio: Servicio = 'linea') {
  return httpClient.put<{ estado: string }>(`${base(servicio)}/plantas/${id}`, datos)
}

/** Borra Sold To (con sus Ship To) o Ship To del listado de Actimist o de Ecofog. */
export function eliminarLoteActimist(tipo: 'sold_to' | 'ship_to', ids: number[], servicio: ServicioConListado = 'actimist') {
  return httpClient.post<{ eliminados: number }>(`/catalogo/${servicio}/eliminar-lote`, { tipo, ids })
}

/** Carga Sold To / Ship To de Actimist desde la dinámica del Planner. Sin
 * `aplicar` solo devuelve qué haría (no escribe). */
export function importarListadoActimist(archivo: File, aplicar: boolean, servicio: ServicioConListado = 'actimist') {
  const datos = new FormData()
  datos.append('archivo', archivo)
  return httpClient.upload<PlanImportacionActimist>(`/catalogo/${servicio}/importar?aplicar=${aplicar}`, datos)
}
