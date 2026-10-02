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
