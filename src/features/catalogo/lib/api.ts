import { httpClient } from '@/services/http/client'
import type { Cliente, ClienteInput, Planta, PlantaInput } from './tipos'

export function listarClientes() {
  return httpClient.get<Cliente[]>('/catalogo/clientes')
}

export function crearCliente(datos: ClienteInput) {
  return httpClient.post<{ id: number }>('/catalogo/clientes', datos)
}

export function editarCliente(id: number, datos: ClienteInput) {
  return httpClient.put<{ estado: string }>(`/catalogo/clientes/${id}`, datos)
}

export function listarPlantas() {
  return httpClient.get<Planta[]>('/catalogo/plantas')
}

export function crearPlanta(datos: PlantaInput) {
  return httpClient.post<{ id: number }>('/catalogo/plantas', datos)
}

export function editarPlanta(id: number, datos: PlantaInput) {
  return httpClient.put<{ estado: string }>(`/catalogo/plantas/${id}`, datos)
}
