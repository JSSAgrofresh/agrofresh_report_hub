import { httpClient } from '@/services/http/client'
import { descargarArchivo } from '@/services/http/descargar'

export interface PlantaLista {
  sold_to: string
  ship_to: string
}

export interface FilaLista {
  sold_to: string
  ship_to: string
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
  fila: FilaLista | null
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

export type FiltroCambios = 'todos' | 'agregan' | 'quitan' | 'nuevas' | 'copia'

export const ETIQUETA_FILTRO: Record<FiltroCambios, string> = {
  todos: 'Todos',
  agregan: 'Solo agregan',
  quitan: 'Quitan a alguien',
  nuevas: 'Plantas nuevas',
  copia: 'Ajuste de copia',
}
export const ORDEN_FILTROS: FiltroCambios[] = ['todos', 'agregan', 'quitan', 'nuevas', 'copia']

export function coincideFiltro(c: CambioLista, filtro: FiltroCambios): boolean {
  switch (filtro) {
    case 'agregan': return c.tipo === 'campo' && c.quitar.length === 0
    case 'quitan': return c.quitar.length > 0
    case 'nuevas': return c.tipo === 'planta_nueva'
    case 'copia': return c.tipo === 'copia'
    default: return true
  }
}

/** Sin tildes ni mayúsculas, para buscar «romeral» y encontrar «ROMERAL». */
function plano(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function filtrarCambios(cambios: CambioLista[], filtro: FiltroCambios, texto: string): CambioLista[] {
  const palabras = plano(texto).split(/\s+/).filter(Boolean)
  return cambios.filter((c) => {
    if (!coincideFiltro(c, filtro)) return false
    if (palabras.length === 0) return true
    const pajar = plano([c.planta.sold_to, c.planta.ship_to, c.etiqueta, ...c.agregar, ...c.quitar, ...c.corregir].join(' '))
    return palabras.every((p) => pajar.includes(p))
  })
}

export interface GrupoPlanta {
  clave: string
  planta: PlantaLista
  cambios: CambioLista[]
}

/** Los cambios agrupados por planta, en el orden en que aparecen. */
export function agruparPorPlanta(cambios: CambioLista[]): GrupoPlanta[] {
  const grupos = new Map<string, GrupoPlanta>()
  for (const c of cambios) {
    const clave = `${c.planta.sold_to}\u0000${c.planta.ship_to}`
    const g = grupos.get(clave) ?? { clave, planta: c.planta, cambios: [] }
    g.cambios.push(c)
    grupos.set(clave, g)
  }
  return [...grupos.values()]
}

/** Cuántos correos se agregan, quitan o ajustan entre los cambios dados. */
export function contarCorreos(cambios: CambioLista[]) {
  return cambios.reduce(
    (t, c) => ({
      agregan: t.agregan + c.agregar.length + (c.fila ? contarFila(c.fila) : 0),
      quitan: t.quitan + c.quitar.length,
      ajustan: t.ajustan + c.corregir.length,
    }),
    { agregan: 0, quitan: 0, ajustan: 0 },
  )
}

function contarFila(f: FilaLista): number {
  return f.admin.length + f.comercial.length + f.tecnico.length + Object.values(f.clientes).reduce((n, l) => n + l.length, 0)
}
