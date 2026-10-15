export type CategoriaNotificacion = 'actualizacion' | 'sistema' | 'cromatografia'
/** Tipos de cuenta a los que se puede dirigir un aviso (los clientes no tienen campana). */
export type TipoCuentaDestino = 'admin_general' | 'gerencia' | 'admin_area' | 'analista' | 'muestreador'
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
  /** Notificación de prueba: solo la ve quien la mandó. */
  prueba?: boolean
  /** Tipos de cuenta a los que va un aviso escrito a mano (sin esto, manda `audiencia`). */
  tipos_destino?: TipoCuentaDestino[]
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
  /** A quién va: el aviso lo ven solo estos tipos de cuenta. */
  tipos_destino?: TipoCuentaDestino[]
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
