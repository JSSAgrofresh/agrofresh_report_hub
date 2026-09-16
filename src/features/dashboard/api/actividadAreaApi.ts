import { httpClient } from '@/services/http/client'
import type { AreaId } from '@/constants/areas'
import type { ActividadArea } from '../types'

export async function fetchActividadArea(area: AreaId): Promise<ActividadArea> {
  return httpClient.get<ActividadArea>(`/dashboard/actividad-area?area=${area}`)
}
