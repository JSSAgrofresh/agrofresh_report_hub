import { httpClient } from '@/services/http/client'

export interface ValorAnalizado {
  valor_crudo: string
  filas: number
  sugerencia_auto: string | null
  automatico: boolean
  regla: string
  sugerencias: { valor: string; confianza: number }[]
}

export interface AnalisisIngesta {
  token: string
  total_filas: number
  columnas: {
    sold_to: ValorAnalizado[]
    ship_to: ValorAnalizado[]
    especie: ValorAnalizado[]
    variedad: ValorAnalizado[]
  }
}

export interface ResumenIngesta {
  token?: string
  solicitudes_nuevas: number
  solicitudes_existentes: number
  clientes_nuevos: number
  plantas_nuevas: number
  resultados: number
  filas_omitidas: number
  pendientes_revision: number
  descartadas: number
}

export function analizarExcel(archivo: File): Promise<AnalisisIngesta> {
  const form = new FormData()
  form.append('archivo', archivo)
  return httpClient.upload<AnalisisIngesta>('/homogenizador-ingesta/analizar', form)
}

export function confirmarIngesta(
  token: string,
  mapeos: {
    sold_to: Record<string, string>
    ship_to: Record<string, string>
    especie: Record<string, string>
    variedad: Record<string, string>
  },
  preview = false,
): Promise<ResumenIngesta> {
  return httpClient.post<ResumenIngesta>('/homogenizador-ingesta/confirmar', {
    token,
    sold_to: { mapeo: mapeos.sold_to },
    ship_to: { mapeo: mapeos.ship_to },
    especie: { mapeo: mapeos.especie },
    variedad: { mapeo: mapeos.variedad },
    preview,
  })
}

export function cancelarIngesta(token: string): Promise<unknown> {
  return httpClient.delete(`/homogenizador-ingesta/cancelar/${token}`)
}
