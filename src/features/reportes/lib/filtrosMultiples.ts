import { claveFiltro } from './filtros'
import type { Observacion } from './tipos'

/**
 * Filtros de varios valores de la «Vista de límites»: cada uno es una lista (vacía = todos).
 * Dentro de un filtro vale cualquiera de los marcados; entre filtros, todos.
 * Report mantiene sus filtros de un solo valor (`FiltrosReporte`); estos corren aparte.
 */
export const CAMPOS_MULTI = ['laboratorio', 'servicio', 'cliente', 'planta', 'crop', 'variedad', 'semana', 'mes'] as const
export type CampoMulti = (typeof CAMPOS_MULTI)[number]
export type FiltrosMulti = Record<CampoMulti, string[]>

export const MULTI_VACIOS: FiltrosMulti = {
  laboratorio: [],
  servicio: [],
  cliente: [],
  planta: [],
  crop: [],
  variedad: [],
  semana: [],
  mes: [],
}

export const ETIQUETAS_MULTI: Record<CampoMulti, string> = {
  laboratorio: 'Laboratorio',
  servicio: 'Tipo de servicio',
  cliente: 'Sold To',
  planta: 'Ship To',
  crop: 'Especie',
  variedad: 'Variedad',
  semana: 'Semana',
  mes: 'Mes',
}

const VALOR: Record<CampoMulti, (o: Observacion) => string | number | null> = {
  laboratorio: (o) => o.laboratorio,
  servicio: (o) => o.servicio ?? null,
  cliente: (o) => o.cliente,
  planta: (o) => o.planta,
  crop: (o) => o.crop,
  variedad: (o) => o.variedad,
  semana: (o) => o.semana,
  mes: (o) => o.mes,
}

/** El valor de una observación en un campo (para armar las opciones de ese desplegable). */
export function valorMulti(o: Observacion, campo: CampoMulti): string | number | null {
  return VALOR[campo](o)
}

/** ¿La observación pasa todos los filtros múltiples? `excepto` deja fuera uno (las opciones de ese mismo desplegable). */
export function cumpleMulti(o: Observacion, m: FiltrosMulti, excepto?: CampoMulti): boolean {
  for (const campo of CAMPOS_MULTI) {
    if (campo === excepto) continue
    const elegidos = m[campo]
    if (elegidos.length === 0) continue
    const clave = claveFiltro(VALOR[campo](o))
    if (!elegidos.some((e) => claveFiltro(e) === clave)) return false
  }
  return true
}

/** Cuántos filtros múltiples tienen algo elegido. */
export function contarMulti(m: FiltrosMulti): number {
  return CAMPOS_MULTI.filter((c) => m[c].length > 0).length
}

/** Un chip por filtro con algo elegido (para ver de un vistazo lo aplicado y quitarlo). */
export function chipsMulti(m: FiltrosMulti, formatear: Partial<Record<CampoMulti, (v: string) => string>> = {}) {
  return CAMPOS_MULTI.filter((c) => m[c].length > 0).map((campo) => ({
    campo,
    etiqueta: ETIQUETAS_MULTI[campo],
    valor: m[campo].map(formatear[campo] ?? ((v: string) => v)).join(', '),
  }))
}

const PLURAL: Partial<Record<CampoMulti, string>> = {
  laboratorio: 'laboratorios',
  servicio: 'servicios',
  cliente: 'clientes',
  planta: 'sucursales',
  crop: 'especies',
  variedad: 'variedades',
}

/** Hasta tres valores se nombran; más de tres se cuentan («5 clientes»). */
function resumir(valores: string[], plural: string): string {
  return valores.length <= 3 ? valores.join(', ') : `${valores.length} ${plural}`
}

/**
 * Título del gráfico principal armado con los filtros: el nombre base y, en este orden, lo elegido en
 * Sold To, Ship To, laboratorio, especie, variedad, semana, mes e ingredientes (estos solo si se acotaron).
 * Sin filtros queda solo el nombre base. `nombreMes` escribe el mes (por defecto, el número).
 */
export function tituloLimites(
  base: string,
  m: FiltrosMulti,
  ingredientes: string[] = [],
  nombreMes: (mes: string) => string = (v) => v,
): string {
  const semanas =
    m.semana.length === 0 ? '' : m.semana.length > 3 ? `${m.semana.length} semanas` : `${m.semana.length === 1 ? 'Semana' : 'Semanas'} ${m.semana.join(', ')}`
  const partes = [
    m.cliente.length ? resumir(m.cliente, PLURAL.cliente!) : '',
    m.planta.length ? resumir(m.planta, PLURAL.planta!) : '',
    m.laboratorio.length ? resumir(m.laboratorio, PLURAL.laboratorio!) : '',
    m.servicio.length ? resumir(m.servicio, PLURAL.servicio!) : '',
    m.crop.length ? resumir(m.crop, PLURAL.crop!) : '',
    m.variedad.length ? resumir(m.variedad, PLURAL.variedad!) : '',
    semanas,
    m.mes.length ? resumir(m.mes.map(nombreMes), 'meses') : '',
    ingredientes.length ? ingredientes.join(', ') : '',
  ].filter((p) => p !== '')
  return [base, ...partes].join(' - ')
}
