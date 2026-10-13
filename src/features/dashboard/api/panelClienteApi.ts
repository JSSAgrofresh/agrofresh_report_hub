import { httpClient } from '@/services/http/client'
import type { PanelCliente } from '../types'

export async function fetchPanelCliente(): Promise<PanelCliente> {
  return httpClient.get<PanelCliente>('/reportes/panel-cliente')
}
