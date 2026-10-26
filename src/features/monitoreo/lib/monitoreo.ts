import { httpClient } from '@/services/http/client'

export type EstadoConexion = 'en_linea' | 'reciente'
/** Con la pestaña abierta: tocó algo hace poco (`activa`), lleva más de 3 min sin tocar nada (`pausa`) o la pestaña está oculta. */
export type ActividadConexion = 'activa' | 'pausa' | 'segundo_plano'
/** Minutos sin tocar nada para pasar a «en pausa» (el mismo corte del servidor: SEGUNDOS_PAUSA). */
export const SEGUNDOS_PAUSA = 180

export interface Conectado {
  email: string
  nombre: string
  tipo: string | null
  area: string | null
  modulo: string | null
  ruta: string | null
  /** Dónde está, en palabras: «Inicio (Panel general)», «Toma de muestras › Solicitudes». */
  pantalla: string
  en_inicio: boolean
  en_pantalla_desde: string | null
  desde: string | null
  ultimo: string | null
  segundos: number
  estado: EstadoConexion
  actividad: ActividadConexion | null
  ultima_interaccion: string | null
  inactivo_segundos: number | null
  dispositivo: string | null
  version: string | null
  /** `latido`: la pestaña avisó; `actividad`: se deduce de lo último que hizo. */
  origen: 'latido' | 'actividad'
  yo: boolean
  acciones_hoy: number
  ultima_accion: string | null
  ultima_accion_en: string | null
}

export interface BloquePulso {
  hora: string
  trabajo: number
  accesos: number
}

export interface InformeLlegado {
  id: number
  laboratorio: string | null
  nro_informe: string | null
  ot: string | null
  ship_to: string | null
  estado: 'ok' | 'amarillo' | 'rojo'
  ya_cargado: boolean
  decision: 'pendiente' | 'aceptado' | 'rechazado'
  llegada: string | null
}

export interface SolicitudEnviada {
  id: number
  t: string | null
  numero: string | null
  laboratorio: string | null
  enviado_por: string | null
  exitoso: boolean
  error: string | null
  ship_to: string | null
}

export interface EnvioFallido {
  tipo: string
  creado_en: string | null
  referencia: string
  laboratorio: string
  enviado_por: string
  error: string
}

export interface ModuloConGente {
  modulo: string
  personas: number
  activas: number
  nombres: string[]
}

export interface EventoReciente {
  t: string
  email: string
  nombre: string
  categoria: string
  texto: string
  modulo: string | null
}

export interface ResumenMonitoreo {
  ahora: string
  conectados: Conectado[]
  en_linea: number
  activos: number
  en_pausa: number
  clientes_en_linea: number
  por_modulo: ModuloConGente[]
  actividad_reciente: EventoReciente[]
  kpis: {
    acciones_ultima_hora: number
    acciones_hora_anterior: number
    informes_hoy: number
    solicitudes_creadas_hoy: number
    solicitudes_enviadas_hoy: number
    acciones_hoy: number
    personas_hoy: number
  }
  pulso: BloquePulso[]
  informes: InformeLlegado[]
  solicitudes: SolicitudEnviada[]
  alertas: { envios_fallidos: EnvioFallido[]; informes_en_rojo: number }
}

export interface EventoLinea {
  t: string
  categoria: string
  accion: string
  texto: string
  modulo: string | null
}

/** A qué Sold To y Ship To pertenece una cuenta (`ship_to` null = todas las plantas de ese Sold To; `especies` vacío = todas). */
export interface AccesoCuenta {
  sold_to: string
  ship_to: string | null
  especies: string[]
}

export interface CuentaPertenencia {
  tipo: string | null
  area: string | null
  accesos: AccesoCuenta[]
}

export interface SesionConexion {
  inicio: string
  fin: string
  segundos: number
  segundos_activo: number
  dispositivo: string | null
}

export interface ClienteConectado {
  email: string
  nombre: string
  tipo: string | null
  cliente: string | null
  planta: string | null
  sesiones: number
  segundos_conectado: number
  segundos_activo: number
  primera: string
  ultima: string
  segundos_desde_ultima: number
  en_linea: boolean
  dispositivo: string | null
}

export interface ClientesPeriodo {
  disponible: boolean
  dias: number
  cuentas: ClienteConectado[]
  en_linea?: number
  segundos_total?: number
}

export interface DetalleUsuario {
  email: string
  nombre: string
  desde: string
  origen_desde: 'conexion' | 'ingreso' | 'hoy'
  ahora: string
  en_linea: boolean
  actividad: ActividadConexion | null
  inactivo_segundos: number | null
  ultimo_latido: string | null
  pantalla: string | null
  en_pantalla_desde: string | null
  dispositivo: string | null
  version: string | null
  tipo: string | null
  recorrido_tiempos: { modulo: string; desde: string; minutos: number }[]
  sesiones: SesionConexion[]
  cuenta: CuentaPertenencia | null
  modulo_actual: string | null
  total: number
  acciones: number
  por_categoria: Record<string, number>
  recorrido: string[]
  eventos: EventoLinea[]
}

export const obtenerResumen = () => httpClient.get<ResumenMonitoreo>('/monitoreo/resumen')
export const obtenerClientes = (dias: number) => httpClient.get<ClientesPeriodo>(`/monitoreo/clientes?dias=${dias}`)
export const obtenerDetalleUsuario = (email: string) =>
  httpClient.get<DetalleUsuario>(`/monitoreo/usuario?email=${encodeURIComponent(email)}`)
/** Cada pestaña abierta avisa que sigue ahí (alimenta «conectados» en el monitoreo). Si falla no importa. */
export interface DatosLatido {
  ruta: string
  inactivo_segundos: number
  visible: boolean
  dispositivo: string
  version: string
}
export const enviarLatido = (datos: DatosLatido) => httpClient.post<{ ok: boolean }>('/monitoreo/latido', datos)

// ── Presentación (puro) ────────────────────────────────────────────────

/** «ahora», «hace 3 min», «hace 2 h», «hace 4 d». `ahoraMs` viene del servidor para no fiarse del reloj del teléfono. */
export function hace(iso: string | null | undefined, ahoraMs: number): string {
  if (!iso) return '—'
  const seg = Math.max(0, Math.round((ahoraMs - new Date(iso).getTime()) / 1000))
  if (seg < 45) return 'ahora'
  const min = Math.round(seg / 60)
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  return `hace ${Math.floor(h / 24)} d`
}

/** «1 h 12 min», «8 min», «menos de 1 min». */
export function duracion(desdeIso: string, hastaIso: string): string {
  const min = Math.max(0, Math.round((new Date(hastaIso).getTime() - new Date(desdeIso).getTime()) / 60000))
  if (min < 1) return 'menos de 1 min'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const r = min % 60
  return r ? `${h} h ${r} min` : `${h} h`
}

/** La hora en Chile, «14:32». */
export function horaChile(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Santiago' })
}

/** Un tono (0–359) siempre igual para la misma persona: el avatar no cambia de color entre recargas. */
export function tonoDe(texto: string): number {
  let h = 0
  for (let i = 0; i < texto.length; i++) h = (h * 31 + texto.charCodeAt(i)) % 360
  return h
}

/** Las claves que aparecieron respecto de la vuelta anterior (para destacarlas un momento). La primera vuelta no destaca nada. */
export function claveNuevas<T>(previas: Set<string> | null, items: T[], clave: (i: T) => string): Set<string> {
  const nuevas = new Set<string>()
  if (!previas) return nuevas
  for (const i of items) if (!previas.has(clave(i))) nuevas.add(clave(i))
  return nuevas
}

/** Puntos de un área suave para el pulso: devuelve `{linea, area, max}` en un lienzo de `ancho` × `alto`. */
export function trazoPulso(serie: number[], ancho: number, alto: number, margen = 6) {
  const max = Math.max(1, ...serie)
  const n = serie.length
  const x = (i: number) => (n <= 1 ? ancho / 2 : (i / (n - 1)) * ancho)
  const y = (v: number) => alto - margen - (v / max) * (alto - margen * 2)
  const pts = serie.map((v, i) => [x(i), y(v)] as const)
  // curva suave que no se sale de los valores (control a la mitad entre puntos)
  let linea = pts.length ? `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}` : ''
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]
    const [x1, y1] = pts[i]
    const cx = (x0 + x1) / 2
    linea += ` C${cx.toFixed(1)},${y0.toFixed(1)} ${cx.toFixed(1)},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`
  }
  const area = pts.length ? `${linea} L${ancho},${alto} L0,${alto} Z` : ''
  return { linea, area, max, ultimo: pts.length ? { x: pts[pts.length - 1][0], y: pts[pts.length - 1][1] } : null }
}

export const TEXTO_ORIGEN_DESDE: Record<DetalleUsuario['origen_desde'], string> = {
  conexion: 'desde que se conectó',
  ingreso: 'desde su último ingreso',
  hoy: 'desde el inicio del día',
}

/** «Móvil · Chrome · app», «Escritorio · Edge». Solo para que el administrador sepa desde qué aparato mira cada quien. */
export function dispositivoDe(userAgent: string, anchoPantalla: number, instalada: boolean): string {
  const ua = userAgent || ''
  const tipo = /iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))
    ? 'Tablet'
    : /Mobi|iPhone|Android/i.test(ua) || anchoPantalla < 600 ? 'Móvil' : 'Escritorio'
  const navegador = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\/|CriOS/.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Navegador'
  return [tipo, navegador, instalada ? 'app' : null].filter(Boolean).join(' · ')
}

/** Cuánto lleva sin tocar nada: «hace 40 s», «hace 4 min». */
export function textoInactividad(seg: number | null): string {
  if (seg === null) return ''
  if (seg < 60) return `hace ${Math.max(5, Math.round(seg / 5) * 5)} s`
  return `hace ${Math.round(seg / 60)} min`
}

export const ETIQUETA_ACTIVIDAD: Record<ActividadConexion, string> = {
  activa: 'Activo',
  pausa: 'En pausa',
  segundo_plano: 'Pestaña en segundo plano',
}

/** «+3 que hace una hora», «igual que hace una hora»: para el ritmo de trabajo. */
export function tendencia(ahora: number, antes: number): { texto: string; sube: boolean | null } {
  if (ahora === antes) return { texto: 'igual que la hora anterior', sube: null }
  const d = ahora - antes
  return { texto: `${d > 0 ? '+' : ''}${d} que la hora anterior`, sube: d > 0 }
}

/** «42 min», «1 h 12 min», «menos de 1 min». Para tiempos en segundos (sesiones). */
export function duracionSeg(seg: number): string {
  const min = Math.round(seg / 60)
  if (min < 1) return 'menos de 1 min'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const r = min % 60
  return r ? `${h} h ${r} min` : `${h} h`
}

export const PERIODOS_CLIENTES = [
  { dias: 1, etiqueta: 'Hoy' },
  { dias: 7, etiqueta: '7 días' },
  { dias: 30, etiqueta: '30 días' },
] as const

export const ETIQUETA_TIPO: Record<string, string> = {
  admin_general: 'Administrador general', gerencia: 'Gerencia', admin_area: 'Administrador de área',
  analista: 'Analista', muestreador: 'Muestreador', cliente: 'Cliente', comercial: 'Comercial',
}
