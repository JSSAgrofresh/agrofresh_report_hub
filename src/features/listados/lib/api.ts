import { httpClient } from '@/services/http/client'
import type {
  EstandaresResponse,
  GrupoHomogenizacion,
  TipoListado,
  ValorLista,
  ValorListaInput,
} from './tipos'

export function listarValores(
  tipo: TipoListado,
  opciones?: { incluirInactivos?: boolean; buscar?: string; especieId?: number },
) {
  const params = new URLSearchParams()
  if (opciones?.incluirInactivos) params.set('incluir_inactivos', 'true')
  if (opciones?.buscar) params.set('buscar', opciones.buscar)
  if (opciones?.especieId) params.set('especie_id', String(opciones.especieId))
  const qs = params.toString()
  return httpClient.get<ValorLista[]>(`/listados/${tipo}${qs ? `?${qs}` : ''}`)
}

export function crearValor(tipo: TipoListado, datos: ValorListaInput) {
  return httpClient.post<{ id: number }>(`/listados/${tipo}`, datos)
}

export function editarValor(tipo: TipoListado, id: number, datos: ValorListaInput) {
  return httpClient.put<{ estado: string }>(`/listados/${tipo}/${id}`, datos)
}

export function eliminarValor(tipo: TipoListado, id: number) {
  return httpClient.delete<{ estado: string }>(`/listados/${tipo}/${id}`)
}

/** Para variedad, especieId es obligatorio -nunca se agrupan variedades de
 * especies distintas, aunque el texto sea idéntico-. */
export function candidatosHomogenizacion(tipo: TipoListado, especieId?: number) {
  const qs = especieId ? `?especie_id=${especieId}` : ''
  return httpClient.get<GrupoHomogenizacion[]>(`/listados/${tipo}/homogenizar${qs}`)
}

export function listarEstandares(tipo: TipoListado, especieId?: number) {
  const qs = especieId ? `?especie_id=${especieId}` : ''
  return httpClient.get<EstandaresResponse>(`/listados/${tipo}/estandares${qs}`)
}

export function crearEstandar(tipo: TipoListado, valor: string, especieId?: number) {
  return httpClient.post<{ id: number }>(`/listados/${tipo}/estandares`, {
    valor,
    activo: true,
    especie_id: especieId ?? null,
  })
}

export function editarEstandar(tipo: TipoListado, id: number, datos: ValorListaInput) {
  return httpClient.put<{ estado: string }>(`/listados/${tipo}/estandares/${id}`, datos)
}

export function eliminarEstandar(tipo: TipoListado, id: number) {
  return httpClient.delete<{ estado: string }>(`/listados/${tipo}/estandares/${id}`)
}

/** Asigna un valor crudo a una variedad estándar (estandarId) o lo libera
 * (estandarId = null) -es la operación atómica detrás de "crear variedades
 * libremente desde un grupo de similitud" y de "mover entre grupos". */
export function asignarValor(tipo: TipoListado, valorId: number, estandarId: number | null) {
  return httpClient.post<{ estado: string }>(`/listados/${tipo}/${valorId}/asignar`, { estandar_id: estandarId })
}

/** Solo las activas -para alimentar selects del resto de la app-. */
export function listarEspeciesActivas() {
  return listarValores('especie')
}

/** Variedades activas de una especie puntual (id) -el select de Variedad en
 * Nueva Solicitud depende de qué Especie se eligió antes-. */
export function listarVariedadesActivasDeEspecie(especieId: number) {
  return listarValores('variedad', { especieId }).then((v) => v.map((x) => x.valor))
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'

/** Excel con las 4 listas -Sold To, Ship To, Especie, Variedad- tal como
 * quedaron después de homogenizar. Es una descarga directa (GET), no pasa
 * por httpClient -mismo patrón que el resto de las descargas de la app-. */
export function urlExportarListados() {
  return `${API_BASE_URL}/listados/exportar`
}
