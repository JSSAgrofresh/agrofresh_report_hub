import { httpClient } from '@/services/http/client'

export interface CampoHomogenizable {
  campo: string
  etiqueta: string
}

export interface ValorHomogenizable {
  valor: string
  filas: number
}

export interface ResultadoHomogenizar {
  actualizadas: number
  destino: string
}

export function listarCamposHomogenizables() {
  return httpClient.get<CampoHomogenizable[]>('/homogenizar/campos')
}

export function listarValores(campo: string, buscar = '') {
  const query = buscar.trim() ? `?buscar=${encodeURIComponent(buscar.trim())}` : ''
  return httpClient.get<ValorHomogenizable[]>(`/homogenizar/${campo}${query}`)
}

/** Deja todas las solicitudes que hoy muestran cualquiera de `valores`
 * mostrando `destino`. Devuelve cuántas filas cambiaron. */
export function homogenizarValores(campo: string, valores: string[], destino: string) {
  return httpClient.post<ResultadoHomogenizar>(`/homogenizar/${campo}`, { valores, destino })
}
