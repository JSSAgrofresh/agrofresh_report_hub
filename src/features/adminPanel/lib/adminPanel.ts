import { httpClient } from '@/services/http/client'

export type CategoriaActividad =
  | 'solicitudes'
  | 'cargas'
  | 'verificaciones'
  | 'laboratorio'
  | 'informes'
  | 'acceso'
  | 'sensible'
  | 'visita'

export interface Variacion {
  valor: number
  previo: number
}

export interface ComponenteSalud {
  clave: string
  titulo: string
  cantidad: number
  descuento: number
}

export interface PuntoSerie {
  fecha: string
  solicitudes: number
  cargas: number
  verificaciones: number
  laboratorio: number
  otros: number
}

export interface UsuarioPanel {
  email: string
  nombre: string
  tipo: string
  area: string | null
  acciones: number
  accesos: number
  visitas: number
  por_categoria: Partial<Record<CategoriaActividad, number>>
  ultima_actividad: string | null
  dormida: boolean
}

export interface ItemAtencion {
  clave: string
  titulo: string
  cantidad: number
  severidad: 'alta' | 'media' | 'baja'
}

export interface ResumenPanel {
  dias: number
  desde: string
  hasta: string
  kpis: {
    usuarios_activos: Variacion & { total: number; variacion: number }
    solicitudes: Variacion & { variacion_pct: number | null }
    concretadas: { pct: number | null; previo: number | null; pendientes: number; de: number }
    tiempo_informe: {
      dias: number | null
      previo: number | null
      por_laboratorio: { laboratorio: string; dias: number | null; n: number }[]
    }
    salud: { puntaje: number; componentes: ComponenteSalud[] }
  }
  serie: PuntoSerie[]
  por_modulo: { modulo: string; total: number }[]
  usuarios: UsuarioPanel[]
  atencion: ItemAtencion[]
  seguridad: {
    fallos_login: { quien: string; intentos: number }[]
    sensibles: { t: string | null; email: string | null; nombre: string | null; texto: string }[]
  }
}

export interface EventoActividad {
  t: string
  email: string | null
  nombre: string | null
  categoria: CategoriaActividad
  accion: string
  texto: string
}

export interface ActividadPanel {
  dias: number
  eventos: EventoActividad[]
  total: number
  serie: PuntoSerie[]
  por_categoria: Partial<Record<CategoriaActividad, number>>
  visitas_por_modulo: { modulo: string; visitas: number }[]
  ficha: { acciones: number; accesos: number; visitas: number; ultima: string | null } | null
}

export function leerResumen(dias: number) {
  return httpClient.get<ResumenPanel>(`/admin-panel/resumen?dias=${dias}`)
}

export function leerActividad(opts: { dias: number; email?: string; categoria?: string }) {
  const p = new URLSearchParams({ dias: String(opts.dias) })
  if (opts.email) p.set('email', opts.email)
  if (opts.categoria) p.set('categoria', opts.categoria)
  return httpClient.get<ActividadPanel>(`/admin-panel/actividad?${p.toString()}`)
}

export type EstadoPersona = 'activa' | 'en_alza' | 'en_baja' | 'nueva' | 'dormida' | 'nunca_ingreso'

export interface PersonaSeguimiento {
  email: string
  nombre: string
  tipo: string
  area: string | null
  acciones: number
  previas: number
  variacion_pct: number | null
  dias_activos: number
  por_dia_activo: number
  visitas: number
  accesos: number
  por_categoria: Partial<Record<CategoriaActividad, number>>
  ultima_actividad: string | null
  creada: string | null
  estado: EstadoPersona
}

export interface Seguimiento {
  dias: number
  resumen: Record<EstadoPersona, number>
  personas: PersonaSeguimiento[]
  /** 7 filas (lunes a domingo) de 24 horas, en hora de Chile. */
  mapa: number[][]
  adopcion: { modulo: string; categoria: string; personas: number; de: number; pct: number; acciones: number }[]
}

export function leerSeguimiento(dias: number) {
  return httpClient.get<Seguimiento>(`/admin-panel/seguimiento?dias=${dias}`)
}

/** El navegador avisa que abrió una pantalla. Si falla no importa. */
export function avisarVisita(ruta: string) {
  return httpClient.post<{ registrada: boolean }>('/actividad/visita', { ruta })
}

// ── Presentación ──────────────────────────────────────────────────────

export const ETIQUETA_CATEGORIA: Record<CategoriaActividad, string> = {
  solicitudes: 'Toma de muestras',
  cargas: 'Ingesta / Converter',
  verificaciones: 'Verificaciones',
  laboratorio: 'AgroFresh Lab',
  informes: 'Informes',
  acceso: 'Accesos',
  sensible: 'Cambios sensibles',
  visita: 'Visitas',
}

/** Colores de cada tipo de trabajo (los mismos en el gráfico, la dona y el historial). */
export const COLOR_CATEGORIA: Record<string, string> = {
  solicitudes: '#6dad3c',
  cargas: '#5aa7e0',
  verificaciones: '#e8c32e',
  laboratorio: '#a58be8',
  informes: '#e39a5b',
  acceso: '#77837b',
  sensible: '#e5655b',
  visita: '#77837b',
}

export function iniciales(nombre: string | null | undefined): string {
  const partes = (nombre ?? '').trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}

/** «▲ 12 %» / «▼ 3 pts» como texto + si el cambio es bueno o malo.
 * `masEsMejor=false` para indicadores donde bajar es bueno (días de demora). */
export function tendencia(
  actual: number | null,
  previo: number | null,
  opts: { unidad?: string; masEsMejor?: boolean } = {},
): { texto: string; tono: 'bueno' | 'malo' | 'neutro' } {
  const { unidad = '', masEsMejor = true } = opts
  if (actual == null || previo == null) return { texto: 'sin período previo', tono: 'neutro' }
  const d = Math.round((actual - previo) * 10) / 10
  if (d === 0) return { texto: 'igual que antes', tono: 'neutro' }
  const sube = d > 0
  const bueno = sube === masEsMejor
  return {
    texto: `${sube ? '▲' : '▼'} ${Math.abs(d).toLocaleString('es-CL')}${unidad ? ' ' + unidad : ''}`,
    tono: bueno ? 'bueno' : 'malo',
  }
}

/** Calificación del puntaje de salud de los datos. */
export function nivelSalud(puntaje: number): 'bueno' | 'regular' | 'malo' {
  if (puntaje >= 90) return 'bueno'
  if (puntaje >= 70) return 'regular'
  return 'malo'
}

/** Total de acciones de un día (suma todas las categorías de trabajo). */
export function totalDia(p: PuntoSerie): number {
  return p.solicitudes + p.cargas + p.verificaciones + p.laboratorio + p.otros
}

export const ETIQUETA_ESTADO: Record<EstadoPersona, { texto: string; tono: 'verde' | 'ambar' | 'rojo' | 'azul' | 'gris'; ayuda: string }> = {
  activa: { texto: 'Activa', tono: 'verde', ayuda: 'Usa el sistema con normalidad.' },
  en_alza: { texto: 'En alza', tono: 'verde', ayuda: 'Hace bastante más que en el período anterior.' },
  en_baja: { texto: 'En baja', tono: 'ambar', ayuda: 'Hace menos de la mitad que en el período anterior.' },
  nueva: { texto: 'Nueva', tono: 'azul', ayuda: 'Cuenta creada en este período.' },
  dormida: { texto: 'Dormida', tono: 'rojo', ayuda: 'Sin actividad hace más de 30 días.' },
  nunca_ingreso: { texto: 'Nunca ingresó', tono: 'rojo', ayuda: 'Tiene cuenta pero jamás entró al sistema.' },
}

export const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

/** Intensidad 0-4 de una celda del mapa de calor, relativa al máximo. */
export function nivelCalor(valor: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (valor <= 0 || max <= 0) return 0
  const f = valor / max
  return f > 0.75 ? 4 : f > 0.5 ? 3 : f > 0.25 ? 2 : 1
}

export const COLOR_CALOR = ['#eef3e8', '#d3e6c1', '#a9d082', '#6dad3c', '#3d6b1f']

/** El día y la hora con más uso, y el total de la franja de oficina (8-18 h, lunes a viernes). */
export function horasPico(mapa: number[][]): { dia: string; hora: number; total: number } | null {
  let mejor: { dia: string; hora: number; total: number } | null = null
  mapa.forEach((fila, d) =>
    fila.forEach((v, h) => {
      if (v > (mejor?.total ?? 0)) mejor = { dia: DIAS_SEMANA[d], hora: h, total: v }
    }),
  )
  return mejor
}

/** Cuánto del uso cae fuera del horario de oficina (antes de las 8, desde las 19 o fin de semana), en %. */
export function usoFueraDeHorario(mapa: number[][]): number | null {
  let total = 0
  let fuera = 0
  mapa.forEach((fila, d) =>
    fila.forEach((v, h) => {
      total += v
      if (d >= 5 || h < 8 || h >= 19) fuera += v
    }),
  )
  return total ? Math.round((fuera * 100) / total) : null
}
