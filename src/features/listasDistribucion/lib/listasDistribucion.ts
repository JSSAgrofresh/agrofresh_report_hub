import { httpClient } from '@/services/http/client'
import { descargarArchivo } from '@/services/http/descargar'

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
  /** campo: agregar/quitar correos de un rol o categoría; copia: ajustar a CC/CCO; planta_nueva: planta sin listas aún */
  tipo: 'campo' | 'copia' | 'planta_nueva'
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
  resumen: ResumenComparacion
}

export interface ResultadoAplicar {
  aplicados: number
  plantas: number
  ignorados: string[]
  respaldo: string
  listados_creados?: { clientes: number; plantas: number }
}

export function exportarListas(incluirPlantasSinLista: boolean) {
  return descargarArchivo(
    `/listas-distribucion/excel?todas=${incluirPlantasSinLista}`,
    'listas_distribucion.xlsx',
  )
}

export function compararListas(archivo: File) {
  const datos = new FormData()
  datos.append('archivo', archivo)
  return httpClient.upload<ResultadoComparacion>('/listas-distribucion/comparar', datos)
}

export function aplicarListas(cambios: CambioLista[]) {
  return httpClient.post<ResultadoAplicar>('/listas-distribucion/aplicar', { cambios })
}
