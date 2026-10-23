import { httpClient } from '@/services/http/client'

export type Situacion = 'cargado' | 'por_aceptar' | 'rechazado' | 'esperando'
export type Origen = 'automatica' | 'manual' | 'ingreso_lab' | 'excel' | 'sin_registro' | 'sin_cargar'
export type Gravedad = 'alto' | 'medio' | 'info'

export interface ProblemaRegistro {
  codigo: string
  gravedad: Gravedad
  texto: string
  /** «envio»: lo que encontró la revisión del correo; «datos»: lo que encontró el diagnóstico de los datos cargados. */
  origen: 'envio' | 'datos'
}

/** Una fila: una solicitud y su informe (o la solicitud sola, si aún espera el informe). */
export interface FilaRegistro {
  id: string
  situacion: Situacion
  laboratorio: string | null
  ot: string | null
  informe: string | null
  sold_to: string | null
  ship_to: string | null
  especie: string | null
  tipo_aplicacion: string | null
  emitida: string | null
  enviada_lab: string | null
  fecha_muestreo: string | null
  fecha_informe: string | null
  llegada: string | null
  llegada_por: string | null
  cargado: string | null
  cargado_por: string | null
  carga_archivo: string | null
  origen: Origen
  enviado_cliente: string | null
  correo_id: number | null
  envios: number
  problemas: ProblemaRegistro[]
}

export function leerRegistro() {
  return httpClient.get<{ filas: FilaRegistro[] }>('/registro-informes')
}

export type FiltroRegistro =
  | 'todos' | 'problemas' | 'automatica' | 'manual' | 'ingreso_lab' | 'excel' | 'por_aceptar' | 'rechazado' | 'esperando'

export const FILTROS_REGISTRO: { id: FiltroRegistro; etiqueta: string }[] = [
  { id: 'todos', etiqueta: 'Todos' },
  { id: 'problemas', etiqueta: 'Con problemas' },
  { id: 'automatica', etiqueta: 'Cargados automático' },
  { id: 'manual', etiqueta: 'Cargados a mano' },
  { id: 'ingreso_lab', etiqueta: 'Ingreso al laboratorio' },
  { id: 'excel', etiqueta: 'Carga masiva' },
  { id: 'por_aceptar', etiqueta: 'Por aceptar' },
  { id: 'rechazado', etiqueta: 'Rechazados' },
  { id: 'esperando', etiqueta: 'Esperando informe' },
]

export const ETIQUETA_ORIGEN: Record<Origen, string> = {
  automatica: 'Automática (correo)',
  manual: 'Manual (Converter)',
  ingreso_lab: 'Ingreso al laboratorio',
  excel: 'Carga masiva (Excel)',
  sin_registro: 'Sin registro de la carga',
  sin_cargar: '—',
}

/** Los problemas que importan: lo informativo («info») no cuenta. */
export const problemasDe = (f: FilaRegistro) => f.problemas.filter((p) => p.gravedad !== 'info')

/** La fecha más reciente que se sabe del informe: de ahí sale el orden y el período. */
export const ultimaFecha = (f: FilaRegistro) => f.cargado ?? f.llegada ?? f.enviada_lab ?? f.emitida ?? ''

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

export function cumpleFiltro(f: FilaRegistro, filtro: FiltroRegistro): boolean {
  switch (filtro) {
    case 'todos': return f.situacion !== 'esperando'
    case 'problemas': return f.situacion !== 'esperando' && problemasDe(f).length > 0
    case 'automatica': case 'manual': case 'ingreso_lab': case 'excel': return f.situacion === 'cargado' && f.origen === filtro
    case 'por_aceptar': return f.situacion === 'por_aceptar'
    case 'rechazado': return f.situacion === 'rechazado'
    case 'esperando': return f.situacion === 'esperando'
  }
}

export function contarFiltros(filas: FilaRegistro[]): Record<FiltroRegistro, number> {
  const c = {} as Record<FiltroRegistro, number>
  for (const { id } of FILTROS_REGISTRO) c[id] = filas.filter((f) => cumpleFiltro(f, id)).length
  return c
}

/** Filtra y ordena (lo más reciente primero). `dias` = 0 es todo el tiempo. */
export function filtrarRegistro(
  filas: FilaRegistro[],
  o: { filtro: FiltroRegistro; texto: string; laboratorio: string; dias: number; ahora: number },
): FilaRegistro[] {
  const palabras = sinTildes(o.texto).split(/\s+/).filter(Boolean)
  const desde = o.dias > 0 ? o.ahora - o.dias * 86_400_000 : 0
  return filas
    .filter((f) => cumpleFiltro(f, o.filtro))
    .filter((f) => !o.laboratorio || sinTildes(f.laboratorio ?? '').startsWith(sinTildes(o.laboratorio)))
    .filter((f) => {
      if (!desde) return true
      const t = Date.parse(ultimaFecha(f))
      return Number.isNaN(t) || t >= desde
    })
    .filter((f) => {
      if (palabras.length === 0) return true
      const heno = sinTildes([f.ot, f.informe, f.laboratorio, f.sold_to, f.ship_to, f.especie, f.tipo_aplicacion, f.cargado_por].filter(Boolean).join(' '))
      return palabras.every((p) => heno.includes(p))
    })
    .sort((a, b) => ultimaFecha(b).localeCompare(ultimaFecha(a)))
}

/** El resumen de una fila para su celda de estado. */
export function estadoDe(f: FilaRegistro): { texto: string; tono: 'ok' | 'medio' | 'alto' | 'neutro' } {
  if (f.situacion === 'esperando') return { texto: 'Esperando informe', tono: 'neutro' }
  if (f.situacion === 'por_aceptar') return { texto: 'Por aceptar', tono: 'medio' }
  if (f.situacion === 'rechazado') return { texto: 'Rechazado', tono: 'neutro' }
  const graves = problemasDe(f)
  if (graves.length === 0) return { texto: 'Sin problemas', tono: 'ok' }
  const alto = graves.some((p) => p.gravedad === 'alto')
  return { texto: `${graves.length} ${graves.length === 1 ? 'problema' : 'problemas'}`, tono: alto ? 'alto' : 'medio' }
}
