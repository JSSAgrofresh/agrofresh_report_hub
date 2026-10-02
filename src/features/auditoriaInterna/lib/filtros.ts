import { estadoDe, tipoServicioDe } from './resumen'
import type { EstadoSolicitud, SolicitudAuditoria } from './tipos'

export interface RangoDias {
  /** YYYY-MM-DD, inclusive */
  desde: string
  hasta: string
}

/** Todos los filtros del panel. Vacío = no filtra. */
export interface FiltrosSolicitudes {
  texto: string
  laboratorio: string
  cliente: string
  planta: string
  tipo: string
  especie: string
  variedad: string
  /** una solicitud pasa si pidió AL MENOS UNO de estos analitos */
  analitos: string[]
  estado: EstadoSolicitud | ''
  /** sobre el día en que se emitió la solicitud */
  rango: RangoDias | null
  sinEnvio: boolean
}

export const FILTROS_VACIOS: FiltrosSolicitudes = {
  texto: '',
  laboratorio: '',
  cliente: '',
  planta: '',
  tipo: '',
  especie: '',
  variedad: '',
  analitos: [],
  estado: '',
  rango: null,
  sinEnvio: false,
}

function plano(s: string | null | undefined): string {
  return (s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
}

const igual = (a: string | null | undefined, b: string) => plano(a) === plano(b)

/** El día (YYYY-MM-DD) en que se emitió; se compara como texto, sin zonas. */
export function diaDeEmision(s: SolicitudAuditoria): string | null {
  const m = (s.emitida_en ?? s.fecha_solicitud ?? '').match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

/** El estado NO se aplica acá si `ignorar` lo pide: la tabla lo maneja aparte
 * para que los conteos de cada estado sigan siendo los del resto de filtros. */
export function filtrarSolicitudes(
  lista: SolicitudAuditoria[],
  f: FiltrosSolicitudes,
  ignorar: { estado?: boolean } = {},
): SolicitudAuditoria[] {
  const q = plano(f.texto)
  return lista.filter((s) => {
    if (f.laboratorio && !igual(s.laboratorio, f.laboratorio)) return false
    if (f.cliente && !igual(s.sold_to, f.cliente)) return false
    if (f.planta && !igual(s.ship_to, f.planta)) return false
    if (f.tipo && tipoServicioDe(s) !== f.tipo) return false
    if (f.especie && !igual(s.especie, f.especie)) return false
    if (f.variedad && !igual(s.variedad, f.variedad)) return false
    if (f.analitos.length && !f.analitos.some((a) => s.analitos.includes(a))) return false
    if (!ignorar.estado && f.estado && estadoDe(s) !== f.estado) return false
    if (f.sinEnvio && !(s.informe && !s.informe.fecha_envio)) return false
    if (f.rango) {
      const dia = diaDeEmision(s)
      if (!dia || dia < f.rango.desde || dia > f.rango.hasta) return false
    }
    if (!q) return true
    return [
      s.numero_solicitud, s.laboratorio, s.sold_to, s.ship_to, s.especie, s.variedad,
      s.tipo_servicio, s.analitos.join(' '), s.informe?.nro_informe, s.informe?.nombre_archivo,
    ].some((v) => plano(v).includes(q))
  })
}

/** Cuántos filtros hay puestos (para el número junto al botón «Filtros»). */
export function contarFiltros(f: FiltrosSolicitudes): number {
  return [
    f.texto.trim(), f.laboratorio, f.cliente, f.planta, f.tipo, f.especie, f.variedad,
    f.analitos.length ? 'a' : '', f.estado, f.rango ? 'r' : '', f.sinEnvio ? 's' : '',
  ].filter(Boolean).length
}

export interface OpcionesFiltros {
  laboratorios: string[]
  clientes: string[]
  plantas: string[]
  tipos: string[]
  especies: string[]
  variedades: string[]
  analitos: string[]
}

function unicos(valores: (string | null | undefined)[]): string[] {
  return [...new Set(valores.map((v) => (v ?? '').trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'es', { numeric: true }),
  )
}

/** Las opciones de cada desplegable, sacadas de los datos. Las plantas se
 * acotan al cliente elegido y las variedades a la especie elegida: no tiene
 * sentido ofrecer una planta que no es de ese cliente. */
export function opcionesDeFiltros(lista: SolicitudAuditoria[], f: FiltrosSolicitudes): OpcionesFiltros {
  return {
    laboratorios: unicos(lista.map((s) => s.laboratorio)),
    clientes: unicos(lista.map((s) => s.sold_to)),
    plantas: unicos(lista.filter((s) => !f.cliente || igual(s.sold_to, f.cliente)).map((s) => s.ship_to)),
    tipos: unicos(lista.filter((s) => s.tipo_servicio).map(tipoServicioDe)),
    especies: unicos(lista.map((s) => s.especie)),
    variedades: unicos(lista.filter((s) => !f.especie || igual(s.especie, f.especie)).map((s) => s.variedad)),
    analitos: unicos(lista.flatMap((s) => s.analitos)),
  }
}

export interface ChipFiltro {
  clave: keyof FiltrosSolicitudes
  texto: string
}

const ETIQUETA_ESTADO: Record<EstadoSolicitud, string> = {
  concretada: 'Concretadas',
  sin_report: 'PDF sin Report',
  pendiente: 'Pendientes',
}

/** Un chip por filtro puesto, para poder quitarlo de a uno. */
export function chipsDeFiltros(f: FiltrosSolicitudes): ChipFiltro[] {
  const chips: ChipFiltro[] = []
  if (f.texto.trim()) chips.push({ clave: 'texto', texto: `Búsqueda: ${f.texto.trim()}` })
  if (f.laboratorio) chips.push({ clave: 'laboratorio', texto: `Laboratorio: ${f.laboratorio}` })
  if (f.cliente) chips.push({ clave: 'cliente', texto: `Cliente: ${f.cliente}` })
  if (f.planta) chips.push({ clave: 'planta', texto: `Planta: ${f.planta}` })
  if (f.tipo) chips.push({ clave: 'tipo', texto: `Tipo: ${f.tipo}` })
  if (f.especie) chips.push({ clave: 'especie', texto: `Especie: ${f.especie}` })
  if (f.variedad) chips.push({ clave: 'variedad', texto: `Variedad: ${f.variedad}` })
  if (f.analitos.length) chips.push({ clave: 'analitos', texto: `Analitos: ${f.analitos.join(', ')}` })
  if (f.estado) chips.push({ clave: 'estado', texto: `Estado: ${ETIQUETA_ESTADO[f.estado]}` })
  if (f.rango) chips.push({ clave: 'rango', texto: `Emitidas: ${f.rango.desde} al ${f.rango.hasta}` })
  if (f.sinEnvio) chips.push({ clave: 'sinEnvio', texto: 'Sin fecha de envío' })
  return chips
}

/**
 * Los campos del título de la tabla dinámica, uno por cada filtro del panel
 * (Cliente, Sucursal, Laboratorio, Tipo de servicio, Fecha de emisión, Especie,
 * Variedad y Analitos): cada uno dice su valor o «Todos» si no se filtró.
 * Cambia con los filtros, así el título siempre describe lo que muestra la tabla.
 */
export function camposTituloTabla(f: FiltrosSolicitudes): string[] {
  return [
    f.cliente || 'Todos los clientes',
    f.planta || 'Todas las sucursales',
    f.laboratorio || 'Todos los laboratorios',
    f.tipo || 'Todos los tipos de servicio',
    f.rango ? `Emitidas del ${f.rango.desde} al ${f.rango.hasta}` : 'Todas las fechas',
    f.especie || 'Todas las especies',
    f.variedad || 'Todas las variedades',
    f.analitos.length ? f.analitos.join(', ') : 'Todos los analitos',
  ]
}
