import { httpClient } from '@/services/http/client'
import { descargarArchivo } from '@/services/http/descargar'
import { crearCacheDeSesion } from '@/lib/cacheDeSesion'

/** Un día del equipo C&M-500: lo que se usó ese día (el servidor suma lo que subió cada contador, no el acumulado). */
export interface DiaCostoKilo {
  fecha: string
  lecturas: number
  kg: number
  sm_lamina: number
  sm_mant: number
  sm_total: number
  /** Litros de producto comercial del día, por código de ingrediente activo (FDL, TEBU, PYR…). */
  activos: Record<string, number>
  /** Primer o último día, o con menos de 24 lecturas: no es un día completo. */
  /** Lo que marcaba el equipo en la última lectura del día (lo que grafica la plantilla). Faltan en informes antiguos. */
  kg_cierre?: number
  sm_inicial?: number
  activos_cierre?: Record<string, number>
  parcial: boolean
  ml_por_kg: Record<string, number | null>
}

export interface ResumenDiarioCostoKilo {
  desde: string | null
  hasta: string | null
  lecturas: number
  codigos: string[]
  dias: DiaCostoKilo[]
  totales: { kg: number; sm_total: number; activos: Record<string, number>; ml_por_kg: Record<string, number | null> }
}

/** Lo que se muestra en la lista de informes, sin los días. */
export interface ResumenCostoKilo {
  carpeta: string
  guardado_en: string | null
  cliente: string | null
  planta: string | null
  linea: string | null
  equipo: string | null
  origen: 'manual' | 'email'
  desde: string | null
  hasta: string | null
  semanas: string | null
  dias: number
  lecturas: number | null
  kg_total: number | null
  litros: Record<string, number>
  ml_por_kg: Record<string, number | null>
  codigos: string[]
  /** Código → nombre del ingrediente activo según el catálogo. */
  nombres: Record<string, string>
}

export interface DetalleCostoKilo extends ResumenCostoKilo {
  resumen: ResumenDiarioCostoKilo
  archivo: string | null
  /** Solo para el personal de AgroFresh. */
  responsable?: string | null
}

export interface PrevisualizacionCostoKilo {
  archivo: string
  resumen: ResumenDiarioCostoKilo
  nombres: Record<string, string>
  semanas: string | null
}

export interface DatosGuardarCostoKilo {
  nombre: string
  contenido_b64: string
  cliente: string
  planta?: string | null
  linea?: string | null
  equipo?: string | null
}

export type ModoCostoKilo = 'equipo' | 'cliente'

const RUTA: Record<ModoCostoKilo, string> = { equipo: '/costo-kilo/registros', cliente: '/costo-kilo/cliente/informes' }

/** Lo último que se vio, por sesión (igual que la lista de Accu-Tab): cambiar de pantalla no vuelve a mostrar «cargando». */
export const cacheCostoKilo = crearCacheDeSesion<ResumenCostoKilo[]>(2)
const cacheDetalle = crearCacheDeSesion<DetalleCostoKilo>(8)

export function listarCostoKilo(modo: ModoCostoKilo) {
  return httpClient.get<ResumenCostoKilo[]>(RUTA[modo])
}

/** Un informe guardado no cambia: se pide una vez por sesión. */
export async function verCostoKilo(modo: ModoCostoKilo, carpeta: string): Promise<DetalleCostoKilo> {
  const clave = `${modo}|${carpeta}`
  const guardado = cacheDetalle.leer(clave)
  if (guardado) return guardado
  const d = await httpClient.get<DetalleCostoKilo>(`${RUTA[modo]}/${encodeURIComponent(carpeta)}`)
  cacheDetalle.guardar(clave, d)
  return d
}

export function previsualizarCostoKilo(nombre: string, contenido_b64: string) {
  return httpClient.post<PrevisualizacionCostoKilo>('/costo-kilo/previsualizar', { nombre, contenido_b64 })
}

export function guardarCostoKilo(datos: DatosGuardarCostoKilo) {
  return httpClient.post<{ carpeta: string; resumen: ResumenCostoKilo }>('/costo-kilo/registros', datos)
}

export function eliminarCostoKilo(carpeta: string) {
  return httpClient.delete<{ ok: boolean }>(`/costo-kilo/registros/${encodeURIComponent(carpeta)}`)
}

export function descargarPdfCostoKilo(modo: ModoCostoKilo, carpeta: string) {
  return descargarArchivo(`${RUTA[modo]}/${encodeURIComponent(carpeta)}/pdf`, `Costo_por_kilo_${carpeta}.pdf`)
}

export function descargarExcelCostoKilo(modo: ModoCostoKilo, carpeta: string) {
  return descargarArchivo(`${RUTA[modo]}/${encodeURIComponent(carpeta)}/excel`, `Costo_por_kilo_${carpeta}.xlsx`)
}

/** Un archivo del navegador → base64 (sin el prefijo `data:`), en trozos para no reventar la pila con archivos grandes. */
export async function archivoABase64(archivo: File): Promise<string> {
  const bytes = new Uint8Array(await archivo.arrayBuffer())
  let binario = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binario)
}
