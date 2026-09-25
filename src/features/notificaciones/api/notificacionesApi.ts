import { httpClient } from '@/services/http/client'
import type {
  Notificacion,
  NotificacionAdmin,
  NotificacionIn,
  SuscripcionUsuario,
  Suscripciones,
  TipoNotificacion,
} from '../types'

export const notificacionesApi = {
  /** Sin `q`: las 60 más recientes. Con `q`: busca en todas las visibles. */
  listar: (q?: string) =>
    httpClient.get<Notificacion[]>(
      q ? `/notificaciones?q=${encodeURIComponent(q)}` : '/notificaciones',
    ),

  noLeidas: () =>
    httpClient.get<{ total: number }>('/notificaciones/no-leidas'),

  misTipos: () =>
    httpClient.get<{ tipos: TipoNotificacion[] }>('/notificaciones/mis-tipos'),

  marcarLeida: (id: number) =>
    httpClient.post<{ estado: string }>(`/notificaciones/${id}/leer`, {}),

  marcarTodas: () =>
    httpClient.post<{ estado: string }>('/notificaciones/leer-todas', {}),

  // Admin
  adminListar: () =>
    httpClient.get<NotificacionAdmin[]>('/notificaciones/admin/todas'),

  adminCrear: (body: NotificacionIn) =>
    httpClient.post<NotificacionAdmin>('/notificaciones', body),

  adminEditar: (id: number, body: NotificacionIn) =>
    httpClient.put<NotificacionAdmin>(`/notificaciones/${id}`, body),

  adminEliminar: (id: number) =>
    httpClient.delete<{ estado: string }>(`/notificaciones/${id}`),

  adminSuscripciones: () =>
    httpClient.get<Suscripciones>('/notificaciones/admin/suscripciones'),

  adminGuardarSuscripcion: (usuarioId: number, tipos: TipoNotificacion[]) =>
    httpClient.put<SuscripcionUsuario>(`/notificaciones/admin/suscripciones/${usuarioId}`, { tipos }),

  adminRestablecerSuscripcion: (usuarioId: number) =>
    httpClient.delete<SuscripcionUsuario>(`/notificaciones/admin/suscripciones/${usuarioId}`),
}
