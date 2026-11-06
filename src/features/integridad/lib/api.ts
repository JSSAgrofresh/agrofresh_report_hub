import { httpClient } from '@/services/http/client'
import { descargarArchivo } from '@/services/http/descargar'

export type Gravedad = 'alto' | 'medio' | 'info'

export interface ResumenLaboratorio {
  laboratorio: string
  solicitudes_revisadas: number
  informes_revisados: number
  informes_con_problema: number
  solicitudes_con_problema: number
  altos: number
  medios: number
  por_codigo: Record<string, number>
}

export interface ResumenGeneral {
  hoy: string
  solicitudes_revisadas: number
  informes_revisados: number
  informes_con_problema: number
  informes_limpios: number
  hallazgos_altos: number
  hallazgos_medios: number
  pdf_revisado: boolean
}

export interface AnalisisIntegridad {
  id: number
  iniciado_en: string
  terminado_en: string | null
  origen: 'manual' | 'nocturno'
  usuario: string | null
  con_pdf: boolean
  estado: 'en_curso' | 'listo' | 'error'
  avance: string | null
  error?: string | null
  resumen?: ResumenGeneral | null
  laboratorios?: ResumenLaboratorio[] | null
}

export interface EstadoIntegridad {
  disponible: boolean
  en_curso: AnalisisIntegridad | null
  ultimo: AnalisisIntegridad | null
}

export interface HallazgoIntegridad {
  codigo: string
  titulo: string
  gravedad: Gravedad
  detalle: string
  sugerencia: string
  laboratorio: string
  ot: string | null
  informe: string | null
  sold_to: string | null
  ship_to: string | null
  especie: string | null
  fecha_muestreo: string | null
}

export interface TipoHallazgo {
  codigo: string
  titulo: string
  gravedad: Gravedad
  casos: number
}

export interface RespuestaHallazgos {
  analisis_id: number
  total: number
  tipos: TipoHallazgo[]
  hallazgos: HallazgoIntegridad[]
}

export interface FiltroHallazgos {
  laboratorio?: string
  gravedad?: Gravedad | ''
  codigo?: string
  q?: string
  desde?: number
  limite?: number
}

export const estadoIntegridad = () => httpClient.get<EstadoIntegridad>('/integridad/estado')

export const analizarIntegridad = (con_pdf: boolean, forzar = false) =>
  httpClient.post<{ id: number; en_curso: boolean; ya_estaba_en_curso: boolean }>('/integridad/analizar', { con_pdf, forzar })

export const historialIntegridad = () => httpClient.get<AnalisisIntegridad[]>('/integridad/historial')

export function hallazgosIntegridad(f: FiltroHallazgos) {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== '' && v !== null) p.set(k, String(v))
  return httpClient.get<RespuestaHallazgos>(`/integridad/hallazgos?${p.toString()}`)
}

export const descargarPdfIntegridad = (laboratorio: string) =>
  descargarArchivo(`/integridad/pdf?laboratorio=${encodeURIComponent(laboratorio)}`, `informe_errores_${laboratorio}.pdf`)

export const descargarExcelIntegridad = (laboratorio?: string) =>
  descargarArchivo(`/integridad/excel${laboratorio ? `?laboratorio=${encodeURIComponent(laboratorio)}` : ''}`, 'integridad.xlsx')
