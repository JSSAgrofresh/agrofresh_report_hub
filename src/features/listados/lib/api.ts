import { httpClient } from '@/services/http/client'
import type { GrupoHomogenizacion, TipoListado, ValorLista, ValorListaInput } from './tipos'

export function listarValores(
  tipo: TipoListado,
  opciones?: { incluirInactivos?: boolean; buscar?: string },
) {
  const params = new URLSearchParams()
  if (opciones?.incluirInactivos) params.set('incluir_inactivos', 'true')
  if (opciones?.buscar) params.set('buscar', opciones.buscar)
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

export function candidatosHomogenizacion(tipo: TipoListado) {
  return httpClient.get<GrupoHomogenizacion[]>(`/listados/${tipo}/homogenizar`)
}

export function aplicarHomogenizacion(tipo: TipoListado, ids: number[], valorEstandar: string) {
  return httpClient.post<{ estado: string; valor_estandar_id: number }>(
    `/listados/${tipo}/homogenizar/aplicar`,
    { ids, valor_estandar: valorEstandar },
  )
}

/** Solo las activas -para alimentar selects del resto de la app-. */
export function listarEspeciesActivas() {
  return listarValores('especie').then((v) => v.map((x) => x.valor))
}

export function listarVariedadesActivas() {
  return listarValores('variedad').then((v) => v.map((x) => x.valor))
}
