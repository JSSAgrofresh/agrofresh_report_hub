import { httpClient } from '@/services/http/client'
import type { SeriesDashboard } from '../types'

export async function fetchSeries(): Promise<SeriesDashboard> {
  return httpClient.get<SeriesDashboard>('/dashboard/series')
}
