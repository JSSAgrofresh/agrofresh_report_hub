import { httpClient } from '@/services/http/client'

/** Lo que muestra la presentación en este momento (la presentación lo manda; el teléfono lo lee). */
export interface EstadoPresentacion {
  slide?: string
  eco?: boolean
  pausaEco?: boolean
  sim?: { playing: boolean; paso: number; total: number }
  tab?: 'ico' | 'tok'
  nodo?: string | null
  engranaje?: string | null
}

export type TipoComando =
  | 'ir'
  | 'siguiente'
  | 'anterior'
  | 'simular'
  | 'paso'
  | 'eco'
  | 'pausa_eco'
  | 'pestana'
  | 'nodo'
  | 'engranaje'

export interface Comando {
  seq: number
  tipo: TipoComando
  datos: Record<string, unknown>
}

export interface RespuestaSincronizar {
  comandos: Comando[]
  seq: number
  control_conectado: boolean
}

export interface RespuestaEstado {
  /** El computador tiene abierta la presentación (dio señal hace menos de 8 s). */
  activa: boolean
  estado: EstadoPresentacion
  seq: number
  /** Notas por diapositiva; solo el teléfono las muestra. */
  notas: Record<string, string>
}

/** Latido del computador: deja el estado y recibe las órdenes pendientes (`desde` = la última que ya ejecutó; -1 = recién abierta). */
export const sincronizarPresentacion = (estado: EstadoPresentacion | null, desde: number) =>
  httpClient.post<RespuestaSincronizar>('/presentacion/pc/sincronizar', { estado, desde })

export const cerrarPresentacion = () => httpClient.post<{ ok: boolean }>('/presentacion/pc/cerrar', {})

/** Cómo va la presentación. `control` = lo pide el control remoto (así el computador sabe que hay un teléfono). */
export const obtenerEstadoPresentacion = (control = false) =>
  httpClient.get<RespuestaEstado>(`/presentacion/estado${control ? '?control=true' : ''}`)

export const enviarComando = (tipo: TipoComando, datos?: Record<string, unknown>) =>
  httpClient.post<{ ok: boolean; seq: number }>('/presentacion/comando', { tipo, datos })

export const guardarNotaPresentacion = (slide: string, texto: string) =>
  httpClient.put<{ ok: boolean }>('/presentacion/notas', { slide, texto })
