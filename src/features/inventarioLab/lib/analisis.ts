import type { CategoriaInventario, ItemInventario } from './api'

/** Un insumo con esta cantidad o menos se considera con stock bajo (valor de la maqueta del laboratorio). */
export const STOCK_BAJO = 50
/** Días hacia adelante en que un vencimiento ya es «por vencer». Espejo de `DIAS_POR_VENCER` en `app/inventario_lab.py`. */
export const DIAS_POR_VENCER = 90
export const TOP_STOCK = 10

export interface Resumen {
  registros: number
  codigos: number
  vencidos: number
  porVencer: number
  stockBajo: number
  sinStock: number
}

/** Un frasco vencido pero ya sin stock no es una alerta: ya no está en el estante. */
const conStock = (i: ItemInventario) => i.stock > 0
export const esInsumo = (i: ItemInventario) => i.categoria === 'Insumo'

export function resumir(items: ItemInventario[]): Resumen {
  return {
    registros: items.length,
    codigos: new Set(items.map((i) => i.codigo.trim().toUpperCase())).size,
    vencidos: items.filter((i) => conStock(i) && i.estado_vencimiento === 'vencido').length,
    porVencer: items.filter((i) => conStock(i) && i.estado_vencimiento === 'por_vencer').length,
    stockBajo: items.filter((i) => esInsumo(i) && i.stock > 0 && i.stock <= STOCK_BAJO).length,
    sinStock: items.filter((i) => esInsumo(i) && i.stock <= 0).length,
  }
}

export interface Reparto { vigente: number; porVencer: number; vencido: number }
const vacio = (): Reparto => ({ vigente: 0, porVencer: 0, vencido: 0 })
function sumar(r: Reparto, i: ItemInventario) {
  // «sin fecha» (los insumos) cuenta como vigente, igual que en la maqueta.
  if (i.estado_vencimiento === 'vencido') r.vencido += 1
  else if (i.estado_vencimiento === 'por_vencer') r.porVencer += 1
  else r.vigente += 1
}

export function porTipo(items: ItemInventario[]): { tipo: CategoriaInventario; reparto: Reparto }[] {
  const m = new Map<CategoriaInventario, Reparto>()
  for (const i of items.filter(conStock)) {
    if (!m.has(i.categoria)) m.set(i.categoria, vacio())
    sumar(m.get(i.categoria)!, i)
  }
  return [...m.entries()].map(([tipo, reparto]) => ({ tipo, reparto })).sort((a, b) => a.tipo.localeCompare(b.tipo, 'es'))
}

export function porAnio(items: ItemInventario[]): { anio: string; reparto: Reparto }[] {
  const m = new Map<string, Reparto>()
  for (const i of items.filter(conStock)) {
    if (!i.vencimiento) continue
    const a = i.vencimiento.slice(0, 4)
    if (!m.has(a)) m.set(a, vacio())
    sumar(m.get(a)!, i)
  }
  return [...m.entries()].map(([anio, reparto]) => ({ anio, reparto })).sort((a, b) => a.anio.localeCompare(b.anio))
}

export const topStock = (items: ItemInventario[], n = TOP_STOCK) =>
  items.filter((i) => esInsumo(i) && i.stock > 0).sort((a, b) => b.stock - a.stock).slice(0, n)

export const stockBajo = (items: ItemInventario[]) =>
  items.filter((i) => esInsumo(i) && i.stock <= STOCK_BAJO).sort((a, b) => a.stock - b.stock || a.codigo.localeCompare(b.codigo, 'es', { numeric: true }))

/** Vencidos y por vencer con stock, del más urgente (más vencido) al menos urgente. */
export const requierenAtencion = (items: ItemInventario[]) =>
  items
    .filter((i) => conStock(i) && (i.estado_vencimiento === 'vencido' || i.estado_vencimiento === 'por_vencer') && i.dias_para_vencer !== null)
    .sort((a, b) => (a.dias_para_vencer ?? 0) - (b.dias_para_vencer ?? 0))

export type Columna = 'codigo' | 'descripcion' | 'categoria' | 'ubicacion' | 'lote' | 'vencimiento' | 'stock'
export function ordenar(items: ItemInventario[], col: Columna, asc: boolean): ItemInventario[] {
  const signo = asc ? 1 : -1
  return [...items].sort((a, b) => {
    const x = a[col], y = b[col]
    if (x === null && y === null) return 0
    if (x === null) return 1 // lo vacío siempre al final
    if (y === null) return -1
    if (typeof x === 'number' && typeof y === 'number') return signo * (x - y)
    return signo * String(x).localeCompare(String(y), 'es', { numeric: true, sensitivity: 'base' })
  })
}
