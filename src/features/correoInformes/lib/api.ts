import { httpClient } from '@/services/http/client'

export type EstadoInforme = 'ok' | 'amarillo' | 'rojo'
export type NivelHallazgo = 'rojo' | 'amarillo' | 'info'
export type DecisionInforme = 'pendiente' | 'aceptado' | 'rechazado'

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
  /** Qué se decidió con el informe: pendiente de revisar, aceptado o rechazado (con su motivo en `nota`). */
  decision: DecisionInforme
  decidido_en: string | null
  decidido_por: string | null
  nota: string | null
  /** Seguimiento de un informe en rojo: cuándo se dio por resuelto. */
  resuelto_en: string | null
  resuelto_por: string | null
  /** Cuándo llegó la primera copia de este mismo informe (si es un reenvío, es anterior a `llegada_en`). */
  primera_llegada: string | null
  /** false si después llegó otra copia del mismo informe (esta quedó reemplazada). */
  es_ultima_copia: boolean
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
  pendiente: number
  aceptado: number
  rechazado: number
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

export function listarBandeja(estado: FiltroBandeja = '', q = '', decision: DecisionInforme | '' = '') {
  const params = new URLSearchParams()
  if (estado) params.set('estado', estado)
  if (decision) params.set('decision', decision)
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

export function rechazarInforme(id: number, nota: string) {
  return httpClient.post<{ ok: boolean }>(`/correo-informes/${id}/rechazar`, { nota })
}

export function volverAPendiente(id: number) {
  return httpClient.post<{ ok: boolean }>(`/correo-informes/${id}/volver-a-pendiente`, {})
}

export function resolverSeguimiento(id: number, nota: string) {
  return httpClient.post<{ ok: boolean }>(`/correo-informes/${id}/resolver`, { nota })
}

// ── Panel: KPIs, solicitudes y tendencia de demora ──────────────────────────

export type EstadoSolicitud = 'esperando' | 'recibido' | 'cargado' | 'rechazado'

export interface SolicitudIngreso {
  ot: string
  laboratorio: string | null
  sold_to: string | null
  ship_to: string | null
  especie: string | null
  enviada_en: string
  estado: EstadoSolicitud
  /** Días hábiles que lleva esperando su informe (solo si `estado` es «esperando»). */
  dias_esperando: number | null
  llegada_en: string | null
  /** Días hábiles entre que salió al laboratorio y llegó su informe. */
  demora: number | null
  informe_id: number | null
  nro_informe: string | null
  decision: DecisionInforme | null
}

export interface PuntoDemora {
  semana: string
  n: number
  mediana: number
  por_laboratorio: Record<string, number>
}

export interface PanelIngreso {
  dias: number
  kpis: {
    recibidos: number
    pendientes: number
    aceptados: number
    rechazados: number
    seguimiento: number
    esperando: number
    demora_mediana: number | null
    demora_maxima: number | null
  }
  tendencia: {
    puntos: PuntoDemora[]
    laboratorios: string[]
    /** Días hábiles que sube (o baja, si es negativo) la demora por semana. */
    pendiente_por_semana: number | null
    recta: number[]
  }
  laboratorios: { laboratorio: string; esperando: number; recibidos: number; demora_mediana: number | null }[]
  solicitudes: SolicitudIngreso[]
}

export function panelIngreso(dias = 60) {
  return httpClient.get<PanelIngreso>(`/correo-informes/panel?dias=${dias}`)
}

export function ultimoSondeo() {
  return httpClient.get<UltimoSondeo | null>('/correo-informes/sondeo')
}
