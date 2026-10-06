import { httpClient } from '@/services/http/client'
import { descargarArchivo } from '@/services/http/descargar'
import { parametroServicio } from '@/lib/servicio'
import type { Servicio } from '@/lib/servicio'

export interface PlantaLista {
  sold_to: string
  ship_to: string
}

export interface FilaLista {
  sold_to: string
  ship_to: string
  /** códigos SAP, si el Excel los trae (se usan al crear la planta en Listados) */
  codigo_sold?: string | null
  codigo_ship?: string | null
  admin: string[]
  comercial: string[]
  tecnico: string[]
  clientes: Record<string, string[]>
}

/** Un cambio que se puede confirmar o dejar de lado, independiente de los demás. */
export interface CambioLista {
  id: string
  /** campo: agregar/quitar correos de un rol o categoría; copia: ajustar a CC/CCO; planta_nueva: planta sin listas aún;
   *  planta_quitar: sacar toda la lista de una planta que la base nueva ya no trae */
  tipo: 'campo' | 'copia' | 'planta_nueva' | 'planta_quitar'
  planta: PlantaLista
  campo: string
  etiqueta: string
  agregar: string[]
  quitar: string[]
  corregir: string[]
  aviso: string | null
  /** plantas de Listados con un nombre parecido (solo en planta_nueva con aviso) */
  sugerencias?: PlantaLista[]
  fila: FilaLista | null
  /** solo planta_nueva: crear también el cliente y la planta en Listados */
  crear_en_listados?: boolean
}

export interface ResumenComparacion {
  plantas_excel: number
  plantas_sin_cambios: number
  plantas_con_cambios: number
  cambios: number
  plantas_solo_sistema: number
  solo_sistema: string[]
  avisos?: string[]
}

export interface ResultadoComparacion {
  cambios: CambioLista[]
  /** plantas del sistema que el Excel no trae: se ofrecen para quitar su lista, nunca se quitan solas */
  retiradas?: { planta: PlantaLista }[]
  resumen: ResumenComparacion
}

export interface ResultadoAplicar {
  aplicados: number
  plantas: number
  ignorados: string[]
  respaldo: string
  listados_creados?: { clientes: number; plantas: number }
}

// Todas llevan el servicio: cada uno tiene su lista y guardar en uno nunca
// toca el otro (Línea de proceso va con `servicio` vacío, como antes).
export function exportarListas(incluirPlantasSinLista: boolean, servicio: Servicio = 'linea') {
  const p = parametroServicio(servicio)
  return descargarArchivo(
    `/listas-distribucion/excel?todas=${incluirPlantasSinLista}&servicio=${p}`,
    p ? `listas_distribucion_${p}.xlsx` : 'listas_distribucion.xlsx',
  )
}

export function compararListas(archivo: File, servicio: Servicio = 'linea') {
  const datos = new FormData()
  datos.append('archivo', archivo)
  return httpClient.upload<ResultadoComparacion>(
    `/listas-distribucion/comparar?servicio=${parametroServicio(servicio)}`, datos,
  )
}

export function aplicarListas(cambios: CambioLista[], servicio: Servicio = 'linea') {
  return httpClient.post<ResultadoAplicar>(
    `/listas-distribucion/aplicar?servicio=${parametroServicio(servicio)}`, { cambios },
  )
}
