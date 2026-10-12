import { httpClient } from '@/services/http/client'
import type { Pieza } from '../lib/grilla'

export interface MiDiseno {
  clave: string | null
  piezas: Pieza[]
}

export type Disenos = Record<string, { piezas: Pieza[]; actualizado_por?: string }>

export const leerMiDiseno = () => httpClient.get<MiDiseno>('/panel-inicio/mio')
export const leerDisenos = () => httpClient.get<{ disenos: Disenos }>('/panel-inicio/config')
export const guardarDiseno = (clave: string, piezas: Pieza[]) =>
  httpClient.put<{ clave: string; piezas: Pieza[] }>('/panel-inicio/config', { clave, piezas })
export const restaurarDiseno = (clave: string) =>
  httpClient.delete<{ clave: string }>(`/panel-inicio/config?clave=${encodeURIComponent(clave)}`)
