import { TIPO_ACTIMIST, TIPO_LINEA, TIPO_RYD, tipoServicioDe } from './resumen'
import type { SolicitudAuditoria } from './tipos'

/** Los dos laboratorios de la tabla dinámica. */
export type ClaveLab = 'quiteca' | 'agrofresh'
export const LABS_PIVOTE: { clave: ClaveLab; texto: string }[] = [
  { clave: 'quiteca', texto: 'Quiteca' },
  { clave: 'agrofresh', texto: 'Agrofresh' },
]

/** Orden de los grupos de la tabla: primero Línea de proceso, luego Actimist y RYD. */
export const TIPOS_PIVOTE = [TIPO_LINEA, TIPO_ACTIMIST, TIPO_RYD] as const

/** Las dos áreas de la tabla: Operaciones (Línea de proceso y Actimist, cada
 * uno aparte) y R&D (solo lo suyo, sin esa separación). */
export type AreaPivote = 'operaciones' | 'rd'
export const TIPOS_DE_AREA: Record<AreaPivote, readonly string[]> = {
  operaciones: [TIPO_LINEA, TIPO_ACTIMIST],
  rd: [TIPO_RYD],
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function plano(s: string | null | undefined): string {
  return (s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
}

/** «Agrofresh» y «AGROFRESH» son el mismo laboratorio (ver CLAUDE.md). */
export function claveLab(s: SolicitudAuditoria): ClaveLab | null {
  const l = plano(s.laboratorio)
  if (l.includes('quiteca')) return 'quiteca'
  if (l.includes('agrofresh')) return 'agrofresh'
  return null
}

export interface Dia {
  anio: number
  /** 1-12 */
  mes: number
  dia: number
}

const FMT_CHILE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Santiago',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** El día de la solicitud. Una fecha sin zona («2026-09-28T10:00:00» o solo el
 * día) se lee tal cual; una con zona («…Z», «…-03:00») se pasa a hora de Chile,
 * para que lo emitido de noche no caiga en el mes siguiente. */
export function diaDe(iso: string | null | undefined): Dia | null {
  if (!iso) return null
  const conZona = /(Z|[+-]\d{2}:?\d{2})$/.test(iso) && iso.includes('T')
  if (conZona) {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return null
    const p = Object.fromEntries(FMT_CHILE.formatToParts(d).map((x) => [x.type, x.value]))
    return { anio: Number(p.year), mes: Number(p.month), dia: Number(p.day) }
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return null
  const dia = { anio: Number(m[1]), mes: Number(m[2]), dia: Number(m[3]) }
  return dia.mes >= 1 && dia.mes <= 12 && dia.dia >= 1 && dia.dia <= 31 ? dia : null
}

export const diaDeSolicitud = (s: SolicitudAuditoria) => diaDe(s.emitida_en ?? s.fecha_solicitud)

export interface CeldaLab {
  quiteca: number
  agrofresh: number
  /** quiteca + agrofresh */
  total: number
  /** 0-100 de cada laboratorio sobre `total`; ambos 0 si no hay análisis */
  pctQuiteca: number
  pctAgrofresh: number
}

export interface FilaPivote {
  /** «2026-01» para un mes, «2026-01-S2» para una semana */
  clave: string
  etiqueta: string
  /** solo las semanas: «5 – 11 ene» */
  rango?: string
  /** por tipo de servicio */
  tipos: Record<string, CeldaLab>
}

export interface Pivote {
  meses: FilaPivote[]
  /** semanas de cada mes, por la clave del mes */
  semanas: Record<string, FilaPivote[]>
  totales: Record<string, CeldaLab>
}

function celda(quiteca: number, agrofresh: number): CeldaLab {
  const total = quiteca + agrofresh
  return {
    quiteca,
    agrofresh,
    total,
    pctQuiteca: total ? (quiteca / total) * 100 : 0,
    pctAgrofresh: total ? (agrofresh / total) * 100 : 0,
  }
}

type Conteo = Record<string, { quiteca: number; agrofresh: number }>

function conteoVacio(): Conteo {
  return Object.fromEntries(TIPOS_PIVOTE.map((t) => [t, { quiteca: 0, agrofresh: 0 }]))
}

function aCeldas(c: Conteo): Record<string, CeldaLab> {
  return Object.fromEntries(TIPOS_PIVOTE.map((t) => [t, celda(c[t].quiteca, c[t].agrofresh)]))
}

const claveMes = (anio: number, mes: number) => `${anio}-${String(mes).padStart(2, '0')}`
const diasDelMes = (anio: number, mes: number) => new Date(Date.UTC(anio, mes, 0)).getUTCDate()
/** 0 = lunes … 6 = domingo */
const diaSemana = (anio: number, mes: number, dia: number) => (new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay() + 6) % 7

/** Semana del mes (0, 1, 2…): las semanas empiezan el lunes y la primera es la
 * que contiene el día 1, aunque sea corta. */
export function semanaDelMes(d: Dia): number {
  return Math.floor((d.dia - 1 + diaSemana(d.anio, d.mes, 1)) / 7)
}

function rangoSemana(anio: number, mes: number, semana: number): string {
  const desfase = diaSemana(anio, mes, 1)
  const ini = Math.max(1, semana * 7 - desfase + 1)
  const fin = Math.min(diasDelMes(anio, mes), semana * 7 - desfase + 7)
  const mm = MESES_CORTOS[mes - 1]
  return ini === fin ? `${ini} ${mm}` : `${ini} – ${fin} ${mm}`
}

/**
 * La tabla dinámica: análisis (solicitudes emitidas) por mes y por semana, por
 * tipo de servicio y por laboratorio. Solo cuenta Quiteca y Agrofresh: el % es
 * la parte de cada uno sobre ese total. Los meses sin nada entre el primero y el
 * último se muestran igual (en cero): un hueco también es un dato. Las
 * solicitudes sin fecha o de otro tipo/laboratorio no entran.
 */
export function pivotePorMes(solicitudes: SolicitudAuditoria[]): Pivote {
  const mes = new Map<string, Conteo>()
  const sem = new Map<string, Conteo>()
  const total = conteoVacio()
  let primero: string | null = null
  let ultimo: string | null = null

  for (const s of solicitudes) {
    const lab = claveLab(s)
    const tipo = tipoServicioDe(s)
    const d = diaDeSolicitud(s)
    if (!lab || !d || !(tipo in total)) continue
    const km = claveMes(d.anio, d.mes)
    const ks = `${km}-S${semanaDelMes(d)}`
    const cm = mes.get(km) ?? conteoVacio()
    const cs = sem.get(ks) ?? conteoVacio()
    cm[tipo][lab]++
    cs[tipo][lab]++
    total[tipo][lab]++
    mes.set(km, cm)
    sem.set(ks, cs)
    if (primero === null || km < primero) primero = km
    if (ultimo === null || km > ultimo) ultimo = km
  }

  const meses: FilaPivote[] = []
  const semanas: Record<string, FilaPivote[]> = {}
  if (primero && ultimo) {
    let [a, m] = primero.split('-').map(Number)
    const [af, mf] = ultimo.split('-').map(Number)
    while (a < af || (a === af && m <= mf)) {
      const km = claveMes(a, m)
      const etiqueta = `${MESES[m - 1]} ${a}`
      meses.push({ clave: km, etiqueta, tipos: aCeldas(mes.get(km) ?? conteoVacio()) })
      const n = semanaDelMes({ anio: a, mes: m, dia: diasDelMes(a, m) }) + 1
      semanas[km] = Array.from({ length: n }, (_, i) => ({
        clave: `${km}-S${i}`,
        etiqueta: `Semana ${i + 1}`,
        rango: rangoSemana(a, m, i),
        tipos: aCeldas(sem.get(`${km}-S${i}`) ?? conteoVacio()),
      }))
      if (++m > 12) { m = 1; a++ }
    }
  }
  return { meses, semanas, totales: aCeldas(total) }
}
