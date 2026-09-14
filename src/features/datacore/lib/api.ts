import { httpClient } from '@/services/http/client'
import type { FilaIngest } from '@/features/ingest'
import type { ResultadoValidacion } from './types'

export async function validarExcel(filas: FilaIngest[]): Promise<ResultadoValidacion> {
  return httpClient.post<ResultadoValidacion>('/datacore/validar', { filas, origen: 'excel' })
}

export async function confirmarMapeo(params: {
  entidad: 'sold_to' | 'ship_to'
  valor_crudo: string
  destino_id: number
  cliente_id?: number | null
}): Promise<void> {
  await httpClient.post('/datacore/confirmar-mapeo', params)
}
