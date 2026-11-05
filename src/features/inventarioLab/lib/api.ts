import { httpClient } from '@/services/http/client'

export type CategoriaInventario = 'Estándar certificado' | 'Estándar analítico' | 'Insumo'
export const CATEGORIAS_INVENTARIO: CategoriaInventario[] = ['Estándar certificado', 'Estándar analítico', 'Insumo']

export type EstadoVencimiento = 'vencido' | 'por_vencer' | 'vigente' | 'sin_fecha'

/** Un frasco / caja / lote físico. El `codigo` (INS-01…) NO es único: dos productos pueden compartirlo. */
export interface ItemInventario {
  id: number
  codigo: string
  categoria: CategoriaInventario
  ubicacion: string | null
  descripcion: string
  detalle: string | null
  almacenamiento: string | null
  presentacion: string | null
  lote: string | null
  vencimiento: string | null
  referencia: string | null
  stock: number
  activo: boolean
  actualizado: string
  estado_vencimiento: EstadoVencimiento
  dias_para_vencer: number | null
}

export type ItemEditable = Omit<ItemInventario, 'id' | 'activo' | 'actualizado' | 'estado_vencimiento' | 'dias_para_vencer'>

export type TipoMovimiento = 'ingreso' | 'salida' | 'ajuste'

export interface MovimientoInventario {
  id: number
  item_id: number
  codigo: string
  descripcion: string
  lote: string | null
  tipo: TipoMovimiento | 'alta'
  cantidad: number
  stock_antes: number
  stock_despues: number
  nota: string | null
  usuario: string | null
  fecha: string
}

export interface ResumenInventario {
  total: number
  vencidos: number
  por_vencer: number
  sin_stock: number
  sin_fecha: number
  dias_por_vencer: number
}

export const listarInventario = () => httpClient.get<ItemInventario[]>('/inventario-lab/items')
export const resumenInventario = () => httpClient.get<ResumenInventario>('/inventario-lab/resumen')
export const buscarPorCodigo = (codigo: string) =>
  httpClient.get<ItemInventario[]>(`/inventario-lab/buscar?codigo=${encodeURIComponent(codigo)}`)
export const siguienteCodigo = () => httpClient.get<{ codigo: string }>('/inventario-lab/siguiente-codigo')
export const crearItem = (item: ItemEditable) => httpClient.post<ItemInventario>('/inventario-lab/items', item)
export const corregirItem = (id: number, item: ItemEditable) =>
  httpClient.put<ItemInventario>(`/inventario-lab/items/${id}`, item)
export const moverStock = (id: number, tipo: TipoMovimiento, cantidad: number, nota?: string) =>
  httpClient.post<ItemInventario>(`/inventario-lab/items/${id}/movimiento`, { tipo, cantidad, nota: nota || null })
export const retirarItem = (id: number) => httpClient.delete<void>(`/inventario-lab/items/${id}`)
export const listarMovimientos = (limite = 100) =>
  httpClient.get<MovimientoInventario[]>(`/inventario-lab/movimientos?limite=${limite}`)

/** Lo que se ve en la etiqueta de estado de una fecha de vencimiento. */
export function etiquetaVencimiento(i: Pick<ItemInventario, 'estado_vencimiento' | 'dias_para_vencer'>): string {
  const d = i.dias_para_vencer
  switch (i.estado_vencimiento) {
    case 'vencido': return d !== null ? `Vencido hace ${Math.abs(d)} d` : 'Vencido'
    case 'por_vencer': return d === 0 ? 'Vence hoy' : `Vence en ${d} d`
    case 'vigente': return 'Vigente'
    default: return 'Sin fecha'
  }
}

export const formatearFecha = (iso: string | null): string => {
  if (!iso) return '—'
  const [a, m, d] = iso.split('-')
  return d ? `${d}-${m}-${a}` : iso
}

/** El stock sin decimales de más: 3, 2,5. */
export const formatearStock = (n: number): string => (Number.isInteger(n) ? String(n) : n.toLocaleString('es-CL', { maximumFractionDigits: 2 }))

export type Filtro = 'todos' | 'por_vencer' | 'vencido' | 'sin_stock'

/** Los que cuentan para las alertas: un frasco vencido pero ya sin stock no molesta. */
export function cumpleFiltro(i: ItemInventario, f: Filtro): boolean {
  if (f === 'sin_stock') return i.stock <= 0
  if (f === 'todos') return true
  return i.stock > 0 && i.estado_vencimiento === f
}
