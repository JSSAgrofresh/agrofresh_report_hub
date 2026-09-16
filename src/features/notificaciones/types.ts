export type CategoriaNotificacion = 'actualizacion' | 'sistema' | 'cromatografia'
export type AudienciaNotificacion = 'todos' | 'admin_general' | 'cromatografia'

export interface Notificacion {
  id: number
  titulo: string
  resumen: string
  cuerpo: string
  categoria: CategoriaNotificacion
  audiencia: AudienciaNotificacion
  publicado: boolean
  creado_en: string | null
  creado_por: string | null
  leida: boolean
}

export interface NotificacionAdmin extends Notificacion {
  leidas_por: number
}

export interface NotificacionIn {
  titulo: string
  resumen: string
  cuerpo: string
  categoria: CategoriaNotificacion
  audiencia: AudienciaNotificacion
  publicado: boolean
}
