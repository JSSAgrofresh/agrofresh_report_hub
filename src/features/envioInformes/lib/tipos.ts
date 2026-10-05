import type { TemplateMail } from '@/features/laboratorios'

export type ModoEnvio = 'prueba' | 'produccion'

export interface Internos {
  cc: string[]
  bcc: string[]
}

export interface EstadoEnvio {
  modo: ModoEnvio
  destinatarios_prueba: string[]
  internos: Internos
  laboratorios: string[]
  modo_cambiado_por: string | null
  modo_cambiado_en: string | null
}

/** Lo que el sistema propone para una planta. */
export interface PlanDestinatarios {
  to: string[]
  cc: string[]
  bcc: string[]
  sin_lista: boolean
  /** Especies para las que la planta tiene lista propia. */
  especies: string[]
}

export interface Reparto {
  to: string[]
  cc: string[]
  bcc: string[]
}

export interface DatosCorreo {
  laboratorio: string
  sold_to: string
  ship_to: string
  especie: string
  asunto: string | null
  cuerpo: string | null
  para: string[]
  cc: string[]
  bcc: string[]
}

export interface VistaPrevia {
  modo: ModoEnvio
  asunto: string
  texto: string
  /** Lo que da la plantilla por sí sola, sin «(PRUEBA)» ni aviso: lo que la
   * pantalla muestra editable. */
  asunto_base: string
  texto_base: string
  html: string
  /** A quién iría de verdad (lo que Paz eligió). */
  reales: Reparto
  /** A quién saldrá en este modo (en prueba, solo Paz y Jorge). */
  efectivos: Reparto
}

export interface ResultadoEnvio extends Reparto {
  ok: string
  modo: ModoEnvio
  mensaje_id: string | null
}

export interface RegistroEnvio {
  id: number
  creado_en: string
  usuario_nombre: string | null
  modo: ModoEnvio
  laboratorio: string | null
  sold_to: string | null
  ship_to: string | null
  especie: string | null
  asunto: string | null
  para: string[]
  cc: string[]
  bcc: string[]
  enviado_to: string[]
  adjuntos: { nombre: string; bytes: number }[]
  exitoso: boolean
  error: string | null
}

export interface Historial {
  disponible: boolean
  items: RegistroEnvio[]
}

export type { TemplateMail }
