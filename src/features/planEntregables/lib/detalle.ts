import type { FilaDetallePlan } from './api'

export interface FiltrosDetallePlan {
  texto: string
  comercial: string
  servicio: string
  tipoCliente: string
  semana: string
}

export const FILTROS_DETALLE_VACIOS: FiltrosDetallePlan = { texto: '', comercial: '', servicio: '', tipoCliente: '', semana: '' }

const plano = (t: string | null | undefined) =>
  (t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export const NOMBRE_SERVICIO: Record<string, string> = { residuales: 'Residuales', fsma: 'FSMA (Microbiología)', fito: 'FITO (Fitopatología)', otro: 'Otro' }

/** Las filas que cumplen los filtros (el texto busca en Sold To, código SAP, planta, comercial y tipo de servicio). */
export function filtrarDetalle(filas: FilaDetallePlan[], f: FiltrosDetallePlan): FilaDetallePlan[] {
  const q = plano(f.texto).trim()
  return filas.filter((x) => {
    if (f.comercial && x.comercial !== f.comercial) return false
    if (f.servicio && x.servicio !== f.servicio) return false
    if (f.tipoCliente && x.tipo_cliente !== f.tipoCliente) return false
    if (f.semana && x.semana !== f.semana) return false
    if (!q) return true
    return plano([x.sold_to, x.sold_to_sap, x.planta_plan, x.comercial, x.tipo_servicio].join(' ')).includes(q)
  })
}

/** Los valores distintos de una columna, sin vacíos y en el orden en que aparecen. */
export function valoresDe(filas: FilaDetallePlan[], campo: 'comercial' | 'tipo_cliente' | 'semana'): string[] {
  return [...new Set(filas.map((x) => x[campo]).filter((v): v is string => Boolean(v)))]
}

/** Totales de lo que está a la vista: filas, Sold To, plantas y las dos cantidades (por servicio y en total). */
export function totalesDetalle(filas: FilaDetallePlan[]) {
  const porServicio: Record<string, { original: number; propuesta: number }> = {}
  let original = 0
  let propuesta = 0
  for (const x of filas) {
    const o = x.original ?? 0
    const p = x.propuesta ?? 0
    original += o
    propuesta += p
    const s = (porServicio[x.servicio] ??= { original: 0, propuesta: 0 })
    s.original += o
    s.propuesta += p
  }
  return {
    filas: filas.length,
    soldTo: new Set(filas.map((x) => x.sold_to)).size,
    plantas: new Set(filas.map((x) => `${x.sold_to}|${x.planta_plan ?? ''}`)).size,
    original,
    propuesta,
    porServicio,
  }
}
