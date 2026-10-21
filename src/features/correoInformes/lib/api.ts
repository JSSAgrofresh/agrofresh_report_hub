import { httpClient } from '@/services/http/client'

export type EstadoInforme = 'ok' | 'amarillo' | 'rojo'
export type NivelHallazgo = 'rojo' | 'amarillo' | 'info'

export interface Hallazgo {
  nivel: NivelHallazgo
  codigo: string
  texto: string
}

/** Una fila de la bandeja: un PDF de informe que llegó por correo. */
export interface InformeCorreo {
  id: number
  laboratorio: string | null
  soportado: boolean
  nro_informe: string | null
  ot: string | null
  sold_to: string | null
  ship_to: string | null
  especie: string | null
  fecha_muestreo: string | null
  asunto: string | null
  remitente: string | null
  llegada_en: string | null
  enviado_en: string | null
  estado: EstadoInforme
  ya_cargado: boolean
  revisado_en: string | null
  resuelto_en: string | null
  hallazgos: Hallazgo[]
  pdf_nombre: string
  tiene_pdf: boolean
}

export interface DestinatariosCorreo {
  to: string[]
  cc: string[]
  bcc: string[]
}

export interface DetalleInformeCorreo extends InformeCorreo {
  para: string[]
  cc: string[]
  bcc: string[]
  esperado: Partial<DestinatariosCorreo>
  /** Nuestras propias cuentas (el buzón del Report Hub): no cuentan como destinatarios de más. */
  propios: string[]
}

export interface ConteosBandeja {
  todos: number
  rojo: number
  amarillo: number
  ok: number
  ya_cargado: number
}

export interface UltimoSondeo {
  id: number
  iniciado_en: string
  terminado_en: string | null
  nuevos: number
  examinados: number
  error: string | null
  dias: number | null
}

export interface Bandeja {
  conteos: ConteosBandeja
  informes: InformeCorreo[]
  ultimo_sondeo: UltimoSondeo | null
}

export type FiltroBandeja = '' | EstadoInforme | 'ya_cargado'

export function listarBandeja(estado: FiltroBandeja = '', q = '') {
  const params = new URLSearchParams()
  if (estado) params.set('estado', estado)
  if (q.trim()) params.set('q', q.trim())
  const s = params.toString()
  return httpClient.get<Bandeja>(`/correo-informes${s ? `?${s}` : ''}`)
}

export function detalleInformeCorreo(id: number) {
  return httpClient.get<DetalleInformeCorreo>(`/correo-informes/${id}`)
}

export function revisarCorreoAhora(dias: number) {
  // Vuelve de inmediato: la revisión sigue en el servidor y su avance se lee en `ultimo_sondeo` de la bandeja.
  return httpClient.post<{ id: number; en_curso: boolean; ya_estaba_en_curso: boolean }>('/correo-informes/sondear', { dias })
}

/** El PDF como blob, para verlo sin guardarlo en disco. */
export function pdfInformeCorreo(id: number) {
  return httpClient.getArchivoConNombre(`/correo-informes/${id}/pdf`)
}
