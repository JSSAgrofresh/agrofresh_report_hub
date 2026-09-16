import { httpClient } from '@/services/http/client'
import type { ActividadDashboard } from '../types'

export async function fetchActividad(): Promise<ActividadDashboard> {
  return httpClient.get<ActividadDashboard>('/dashboard/actividad')
}
