import type { EstadoSolicitud, SolicitudAuditoria } from './tipos'

export function estadoDe(s: SolicitudAuditoria): EstadoSolicitud {
  if (s.concretada) return 'concretada'
  // Tiene su PDF, pero los resultados todavía no se ven en Report (por
  // ejemplo, quedaron en Pendientes de la Ingesta de Datos).
  if (s.informe) return 'sin_report'
  return 'pendiente'
}

interface ConteoEstados {
  emitidas: number
  concretadas: number
  sinReport: number
  pendientes: number
}

function sumar(c: ConteoEstados, s: SolicitudAuditoria) {
  c.emitidas++
  const e = estadoDe(s)
  if (e === 'concretada') c.concretadas++
  else if (e === 'sin_report') c.sinReport++
  else c.pendientes++
}

function conteoVacio(): ConteoEstados {
  return { emitidas: 0, concretadas: 0, sinReport: 0, pendientes: 0 }
}

export interface Totales extends ConteoEstados {
  /** 0-100; 0 si no hay solicitudes */
  porcentajeConcretado: number
}

export function totales(solicitudes: SolicitudAuditoria[]): Totales {
  const t = conteoVacio()
  for (const s of solicitudes) sumar(t, s)
  return { ...t, porcentajeConcretado: t.emitidas ? (t.concretadas / t.emitidas) * 100 : 0 }
}

// ── por laboratorio ─────────────────────────────────────────────────────

export interface LaboratorioResumen extends Totales {
  laboratorio: string
}

export const SIN_LABORATORIO = 'Sin laboratorio'

/** Un resumen por laboratorio, en orden alfabético. */
export function porLaboratorio(solicitudes: SolicitudAuditoria[]): LaboratorioResumen[] {
  const por = new Map<string, ConteoEstados>()
  for (const s of solicitudes) {
    const lab = (s.laboratorio ?? '').trim() || SIN_LABORATORIO
    const c = por.get(lab) ?? conteoVacio()
    sumar(c, s)
    por.set(lab, c)
  }
  return [...por.entries()]
    .map(([laboratorio, c]) => ({
      laboratorio,
      ...c,
      porcentajeConcretado: c.emitidas ? (c.concretadas / c.emitidas) * 100 : 0,
    }))
    .sort((a, b) => a.laboratorio.localeCompare(b.laboratorio, 'es'))
}

// ── tipo de servicio ────────────────────────────────────────────────────

export const TIPO_ACTIMIST = 'Actimist'
export const TIPO_LINEA = 'Línea de proceso'
export const TIPO_RYD = 'RYD'
export const SIN_TIPO = 'Sin tipo'

/** Nombre oficial del área de R&D. El valor guardado en las solicitudes sigue
 * siendo «RYD» (`TIPO_RYD`); este es solo el nombre con que se muestra. */
export const NOMBRE_RYD = 'Investigación y Desarrollo AgroFresh (R&D)'
/** Cómo se llama un tipo de servicio en pantalla. */
export const nombreTipo = (tipo: string) => (tipo === TIPO_RYD ? NOMBRE_RYD : tipo)
/** Nombre corto para ejes y leyendas: «R&D». */
export const tipoCorto = (tipo: string) => (tipo === TIPO_RYD ? 'R&D' : tipo)
/** Título de la dona de un tipo: «Informes de línea de proceso», «Informes de Actimist»… */
export function tituloDonaTipo(tipo: string): string {
  if (tipo === TIPO_LINEA) return 'Informes de línea de proceso'
  return `Informes de ${nombreTipo(tipo)}`
}

function plano(s: string | null | undefined): string {
  return (s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
}

/** El tipo de servicio con un nombre único: «linea de proceso», «Línea de
 * Proceso» y «LINEA DE PROCESO» son lo mismo. */
export function tipoServicioDe(s: SolicitudAuditoria): string {
  const t = plano(s.tipo_servicio)
  if (!t) return SIN_TIPO
  if (t.includes('actimist')) return TIPO_ACTIMIST
  if (t.includes('linea')) return TIPO_LINEA
  if (t === 'ryd' || t.startsWith('ryd ')) return TIPO_RYD
  return (s.tipo_servicio ?? '').trim()
}

/** Cómo van las solicitudes de UN tipo de servicio (Actimist, Línea de proceso o RYD). */
export function resumenPorTipo(solicitudes: SolicitudAuditoria[], tipo: string): Totales {
  return totales(solicitudes.filter((s) => tipoServicioDe(s) === tipo))
}

// ── por cliente y tipo de servicio ──────────────────────────────────────

export interface ParAnalisisInformes {
  /** solicitudes de análisis emitidas */
  analisis: number
  /** informes concretados (con su PDF y ya en Report) */
  informes: number
}

export interface ClienteServicio {
  cliente: string
  /** todas las solicitudes del cliente, de cualquier tipo */
  total: number
  tipos: Record<string, ParAnalisisInformes>
}

export const SIN_CLIENTE = 'Sin cliente'

/** Por cliente: cuántos análisis se pidieron y cuántos informes se concretaron,
 * separado por tipo de servicio. Más solicitudes primero. */
export function porClienteYServicio(solicitudes: SolicitudAuditoria[]): ClienteServicio[] {
  const por = new Map<string, ClienteServicio>()
  for (const s of solicitudes) {
    const cliente = (s.sold_to ?? '').trim() || SIN_CLIENTE
    const c = por.get(cliente) ?? { cliente, total: 0, tipos: {} }
    const tipo = tipoServicioDe(s)
    const par = c.tipos[tipo] ?? { analisis: 0, informes: 0 }
    par.analisis++
    if (s.concretada) par.informes++
    c.tipos[tipo] = par
    c.total++
    por.set(cliente, c)
  }
  return [...por.values()].sort((a, b) => b.total - a.total || a.cliente.localeCompare(b.cliente, 'es'))
}

/** Los clientes con más análisis de los tipos elegidos (los que no tienen
 * ninguno de esos tipos no aparecen), ordenados por esa suma. `limite` 0 = todos. */
export function topClientesPorServicio(
  solicitudes: SolicitudAuditoria[],
  tipos: string[],
  limite: number,
): ClienteServicio[] {
  const puntaje = (c: ClienteServicio) => tipos.reduce((suma, t) => suma + (c.tipos[t]?.analisis ?? 0), 0)
  const con = porClienteYServicio(solicitudes)
    .map((c) => ({ c, p: puntaje(c) }))
    .filter((x) => x.p > 0)
    .sort((a, b) => b.p - a.p || a.c.cliente.localeCompare(b.c.cliente, 'es'))
    .map((x) => x.c)
  return limite > 0 ? con.slice(0, limite) : con
}

// ── por grupo y laboratorio (los 4 laboratorios) ────────────────────────

/** Los cuatro laboratorios que siempre se muestran, aunque no tengan datos. */
export const LABORATORIOS_GRAFICO = ['QUITECA', 'AGROFRESH', 'ALS', 'DIAGNOFRUIT'] as const
export const NOMBRE_LAB: Record<string, string> = {
  QUITECA: 'Quiteca',
  AGROFRESH: 'AgroFresh',
  ALS: 'ALS',
  DIAGNOFRUIT: 'Diagnofruit',
}

/** La clave del laboratorio (QUITECA, AGROFRESH, ALS o DIAGNOFRUIT), o null si es otro. */
export function claveLaboratorio(s: SolicitudAuditoria): string | null {
  const l = plano(s.laboratorio).toUpperCase()
  return (LABORATORIOS_GRAFICO as readonly string[]).includes(l) ? l : null
}

export type DimensionGrafico = 'cliente' | 'planta' | 'especie' | 'tipo'

export const SIN_ESPECIE = 'Sin especie'
export const SIN_SHIP_TO = 'Sin Ship To'

/** El grupo (fila del gráfico) al que pertenece una solicitud. Un Ship To va
 * con su Sold To, porque dos clientes pueden tener una planta con el mismo nombre. */
export function grupoDe(s: SolicitudAuditoria, dimension: DimensionGrafico): string {
  const soldTo = (s.sold_to ?? '').trim() || SIN_CLIENTE
  switch (dimension) {
    case 'cliente': return soldTo
    case 'planta': return `${(s.ship_to ?? '').trim() || SIN_SHIP_TO} · ${soldTo}`
    case 'especie': return (s.especie ?? '').trim() || SIN_ESPECIE
    case 'tipo': return tipoServicioDe(s)
  }
}

export interface GrupoLaboratorios {
  grupo: string
  /** solicitudes del grupo en los 4 laboratorios */
  total: number
  /** por laboratorio: análisis pedidos e informes concretados */
  labs: Record<string, ParAnalisisInformes>
}

/** Por Sold To, Ship To, especie o tipo de servicio: análisis pedidos e informes
 * concretados de CADA uno de los cuatro laboratorios. Más solicitudes primero;
 * `limite` 0 = todos. Las solicitudes de otro laboratorio no entran. */
export function porGrupoYLaboratorio(
  solicitudes: SolicitudAuditoria[],
  dimension: DimensionGrafico,
  limite: number,
): GrupoLaboratorios[] {
  const por = new Map<string, GrupoLaboratorios>()
  for (const s of solicitudes) {
    const lab = claveLaboratorio(s)
    if (!lab) continue
    const grupo = grupoDe(s, dimension)
    const g = por.get(grupo) ?? { grupo, total: 0, labs: {} }
    const par = g.labs[lab] ?? { analisis: 0, informes: 0 }
    par.analisis++
    if (s.concretada) par.informes++
    g.labs[lab] = par
    g.total++
    por.set(grupo, g)
  }
  const orden = [...por.values()].sort((a, b) => b.total - a.total || a.grupo.localeCompare(b.grupo, 'es'))
  return limite > 0 ? orden.slice(0, limite) : orden
}

// ── orden ───────────────────────────────────────────────────────────────

/** `emitida` no es una columna: es el orden de partida (lo más reciente arriba). */
export type CampoOrden = 'emitida' | 'laboratorio' | 'solicitud' | 'informe' | 'cliente' | 'tipo' | 'estado'
export type Sentido = 'asc' | 'desc'

const PESO_ESTADO: Record<EstadoSolicitud, number> = { concretada: 0, sin_report: 1, pendiente: 2 }

function valorDe(s: SolicitudAuditoria, campo: CampoOrden): string | number | null {
  switch (campo) {
    case 'emitida': return s.emitida_en ?? s.fecha_solicitud
    case 'laboratorio': return s.laboratorio
    case 'solicitud': return s.numero_solicitud
    case 'informe': return s.informe?.nro_informe ?? null
    case 'cliente': return s.sold_to
    case 'tipo': return s.tipo_servicio ? tipoServicioDe(s) : null
    case 'estado': return PESO_ESTADO[estadoDe(s)]
  }
}

/** Ordena sin mutar. Los vacíos van SIEMPRE al final, en cualquier sentido:
 * un «sin informe» nunca debe quedar arriba por ordenar de menor a mayor. */
export function ordenarSolicitudes(
  solicitudes: SolicitudAuditoria[],
  campo: CampoOrden,
  sentido: Sentido,
): SolicitudAuditoria[] {
  const signo = sentido === 'asc' ? 1 : -1
  return [...solicitudes].sort((a, b) => {
    const x = valorDe(a, campo)
    const y = valorDe(b, campo)
    if (x === null || x === '') return y === null || y === '' ? 0 : 1
    if (y === null || y === '') return -1
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * signo
    return String(x).localeCompare(String(y), 'es', { numeric: true }) * signo
  })
}

// ── CSV ─────────────────────────────────────────────────────────────────

/** El estado como se muestra: concretada o no. El PDF sin Report se distingue
 * solo entre paréntesis, porque es lo que hay que ir a revisar. */
export function etiquetaEstadoCsv(s: SolicitudAuditoria): string {
  const e = estadoDe(s)
  if (e === 'concretada') return 'Concretada'
  return e === 'sin_report' ? 'Pendiente (PDF sin Report)' : 'Pendiente'
}

/** CSV para Excel en español (separador ";", BOM UTF-8): las columnas de la
 * tabla, más las fechas que la tabla muestra solo al pasar el mouse. */
export function solicitudesACsv(solicitudes: SolicitudAuditoria[]): string {
  const celda = (v: string | number | null | undefined) => {
    const t = v === null || v === undefined ? '' : String(v)
    return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
  }
  const filas = [
    ['Laboratorio', 'Solicitud', 'N° informe', 'Cliente', 'Planta', 'Tipo de análisis', 'Analitos', 'Estado', 'Emitida', 'Cargada', 'Enviada'],
    ...solicitudes.map((s) => [
      s.laboratorio, s.numero_solicitud, s.informe?.nro_informe, s.sold_to, s.ship_to,
      s.tipo_servicio ? tipoServicioDe(s) : '', s.analitos.join(', '), etiquetaEstadoCsv(s),
      s.emitida_en ?? s.fecha_solicitud, s.informe?.cargado_en, s.informe?.fecha_envio,
    ]),
  ]
  return '﻿' + filas.map((f) => f.map(celda).join(';')).join('\r\n')
}
