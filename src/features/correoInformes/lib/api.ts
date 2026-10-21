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
  /** Cuántas veces llegó este informe (un informe = un incidente, aunque se haya mandado varias veces). */
  envios: number
  /** Alguno de esos envíos salió mal. Con la última copia en rojo el incidente sigue abierto; si no, se corrigió. */
  tuvo_incidente: boolean
  /** Ya se le avisó al laboratorio (en cualquier copia de este informe): no se vuelve a alertar por lo mismo. */
  informado: boolean
  informado_en: string | null
  informado_por: string | null
  /** Qué se hizo con el incidente (a quién se avisó, cómo se resolvió). */
  nota_incidente: string | null
  hallazgos: Hallazgo[]
  pdf_nombre: string
  tiene_pdf: boolean
}

export interface DestinatariosCorreo {
  to: string[]
  cc: string[]
  bcc: string[]
}

export interface EnvioDeInforme {
  id: number
  llegada_en: string | null
  estado: EstadoInforme
  para: string[]
  cc: string[]
  que_paso: string
}

export interface DetalleInformeCorreo extends InformeCorreo {
  /** Todos los envíos de este mismo informe, del primero al último. */
  historial: EnvioDeInforme[]
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

export function listarBandeja(estado: FiltroBandeja = '', q = '', decision: DecisionInforme | '' = '', copias = false) {
  const params = new URLSearchParams()
  if (copias) params.set('copias', 'true')
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

export interface ResultadoAceptar {
  id: number
  resultado: 'cargado' | 'revisado'
  carga_id: number | null
  envio_al_cliente: string
  avisos: string[]
}

export interface ResultadoLote {
  aceptados: ResultadoAceptar[]
  errores: { id: number; motivo: string }[]
}

/** Valores de Listados corregidos a mano antes de aceptar (lo que no se manda se queda como se leyó). */
export type CorreccionesHomogeneizacion = Partial<Record<'sold_to' | 'ship_to' | 'especie' | 'variedad', string>>

export function aceptarInforme(id: number, correcciones?: CorreccionesHomogeneizacion) {
  return httpClient.post<ResultadoAceptar>(`/correo-informes/${id}/aceptar`, { correcciones: correcciones ?? {} })
}

export interface Homogeneizacion {
  campos: Record<'sold_to' | 'ship_to' | 'especie' | 'variedad', string>
  leidos: Record<'sold_to' | 'ship_to' | 'especie' | 'variedad', string>
  aprendidos: { campo: string; antes: string; despues: string }[]
  motivos: string[]
  ok: boolean
  opciones: {
    sold_to: string[]
    ship_to: Record<string, string[]>
    especie: string[]
    variedad: Record<string, string[]>
  }
}

export function homogeneizacionInforme(id: number) {
  return httpClient.get<Homogeneizacion>(`/correo-informes/${id}/homogeneizacion`)
}

export function aceptarVarios(ids: number[]) {
  return httpClient.post<ResultadoLote>('/correo-informes/aceptar-lote', { ids })
}

export function deshacerAceptacion(id: number) {
  return httpClient.post<{ id: number; carga_deshecha: number | null }>(`/correo-informes/${id}/deshacer-aceptacion`, {})
}

export function marcarInformado(id: number, nota: string) {
  return httpClient.post<{ ok: boolean }>(`/correo-informes/${id}/informado`, { nota })
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

/** Diagrama de caja de la demora (días hábiles) de un laboratorio. */
export interface CajaDemora {
  laboratorio: string
  n: number
  minimo: number
  q1: number
  mediana: number
  q3: number
  maximo: number
  media: number
  bigote_bajo: number
  bigote_alto: number
  atipicos: number[]
  valores: number[]
}

export interface PanelIngreso {
  dias: number
  kpis: {
    recibidos: number
    pendientes: number
    aceptados: number
    rechazados: number
    /** Informes que salieron mal (uno por informe, no por correo). */
    incidentes: number
    incidentes_abiertos: number
    /** Corregidos por un reenvío o resueltos a mano. */
    incidentes_cerrados: number
    /** Abiertos de los que todavía nadie ha avisado al laboratorio. */
    incidentes_por_informar: number
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
  cajas: CajaDemora[]
  laboratorios: { laboratorio: string; esperando: number; recibidos: number; demora_mediana: number | null }[]
  solicitudes: SolicitudIngreso[]
}

export function panelIngreso(dias = 60) {
  return httpClient.get<PanelIngreso>(`/correo-informes/panel?dias=${dias}`)
}

export function ultimoSondeo() {
  return httpClient.get<UltimoSondeo | null>('/correo-informes/sondeo')
}
