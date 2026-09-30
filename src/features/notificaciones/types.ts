export type CategoriaNotificacion = 'actualizacion' | 'sistema' | 'cromatografia'
export type AudienciaNotificacion = 'todos' | 'admin_general' | 'cromatografia'

/** Tipos de notificación (van en `metadata.tipo`; sin tipo = `anuncio`). */
export type TipoNotificacion =
  | 'solicitud'
  | 'reanalisis'
  | 'verificacion'
  | 'descarga_gc'
  | 'carga_datos'
  | 'anuncio'

export interface NotificacionMetadata {
  tipo: TipoNotificacion
  fecha?: string
}

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
  metadata?: NotificacionMetadata | null
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

export interface TipoNotificacionInfo {
  id: TipoNotificacion
  nombre: string
  descripcion: string
}

/** Qué tipos recibe un usuario. `personalizado` = false: lo de su perfil. */
export interface SuscripcionUsuario {
  usuario_id: number
  nombre: string
  email: string
  tipoAcceso: string
  area: string | null
  tipos: TipoNotificacion[]
  personalizado: boolean
}

export interface Suscripciones {
  tipos: TipoNotificacionInfo[]
  usuarios: SuscripcionUsuario[]
}
