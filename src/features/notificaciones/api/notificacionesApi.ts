import { httpClient } from '@/services/http/client'
import type { Notificacion, NotificacionAdmin, NotificacionIn } from '../types'

export const notificacionesApi = {
  listar: () =>
    httpClient.get<Notificacion[]>('/notificaciones'),

  noLeidas: () =>
    httpClient.get<{ total: number }>('/notificaciones/no-leidas'),

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
}
