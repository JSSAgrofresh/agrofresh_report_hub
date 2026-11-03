import type { SolicitudAuditoria } from '@/features/auditoriaInterna'
import type { ClientePlan, VersionPlan } from './api'
import { normalizarNombre, type FilaPlan } from './plan'

/** Las semanas de la temporada del plan, en orden: W41…W52 y después W01, W02. */
export const SEMANAS_PLAN = ['W41', 'W42', 'W43', 'W44', 'W45', 'W46', 'W47', 'W48', 'W49', 'W50', 'W51', 'W52', 'W01', 'W02']

/** Lugar de una semana en la temporada (0 = W41); -1 si no es de la temporada. */
export function ordenSemana(codigo: string | null | undefined): number {
  return codigo ? SEMANAS_PLAN.indexOf(codigo.trim().toUpperCase()) : -1
}

/** Semana ISO («W46») de una fecha ISO. Solo las de la temporada del plan: W41 a W52 de 2026 (la 53 cuenta como W52) y W01 y W02 de 2027.
 * Una fecha de fuera de la temporada no tiene semana (`null`) y no cuenta. */
export function semanaDeFecha(fecha: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha ?? '')
  if (!m) return null
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  if (Number.isNaN(d.getTime())) return null
  // Semana ISO: el jueves de esa semana manda sobre el año.
  const dia = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dia)
  const anio = d.getUTCFullYear()
  const semana = Math.ceil(((d.getTime() - Date.UTC(anio, 0, 1)) / 86400000 + 1) / 7)
  if (anio === 2026 && semana >= 41) return `W${Math.min(semana, 52)}`
  if (anio === 2027 && semana <= 2) return `W0${semana}`
  return null
}

export type Laboratorio = 'AGROFRESH' | 'QUITECA' | 'ALS' | 'DIAGNOFRUIT'

function laboratorioDe(s: SolicitudAuditoria): Laboratorio | null {
  const l = normalizarNombre(s.laboratorio ?? '')
  return l === 'AGROFRESH' || l === 'QUITECA' || l === 'ALS' || l === 'DIAGNOFRUIT' ? l : null
}

export function servicioDeLab(l: Laboratorio): FilaPlan {
  return l === 'ALS' ? 'fsma' : l === 'DIAGNOFRUIT' ? 'fito' : 'residuales'
}

/** Lo hecho y lo que tocaba de un análisis; en residuales también lo hecho por cada laboratorio. */
export interface CeldaAvance {
  hecho: number
  debia: number
  agrofresh?: number
  quiteca?: number
}

export type CeldasAvance = Record<FilaPlan, CeldaAvance>

export interface PlantaAvance {
  /** Nombre de la planta tal como la escribió el comercial en el plan; `null` = lo hecho que no se pudo cruzar con una planta del plan. */
  planta: string | null
  celdas: CeldasAvance
}

export interface ClienteAvance {
  cliente: string
  celdas: CeldasAvance
  plantas: PlantaAvance[]
  /** El plan trae semana a semana para este Sold To. */
  conPlan: boolean
}

const vacias = (): CeldasAvance => ({
  residuales: { hecho: 0, debia: 0, agrofresh: 0, quiteca: 0 },
  fsma: { hecho: 0, debia: 0 },
  fito: { hecho: 0, debia: 0 },
})

/** ¿Cuenta esa semana? «semana» = solo ella; «acumulado» = desde el inicio de la temporada hasta ella. */
function cuenta(semana: string | null, hasta: string, modo: 'semana' | 'acumulado'): boolean {
  const o = ordenSemana(semana)
  const tope = ordenSemana(hasta)
  if (o < 0 || tope < 0) return false
  return modo === 'semana' ? o === tope : o <= tope
}

/**
 * Por cliente y por planta, lo hecho (solicitudes por laboratorio, en la semana de su muestreo) contra lo que tocaba según el plan.
 * Una solicitud se cruza con una planta del plan cuando su Ship To se llama igual (sin tildes ni mayúsculas); lo que no calza queda
 * en la fila «sin cruzar» del cliente: el plan usa los nombres del comercial, que no siempre son los de Listados.
 */
export function avanceSemanal(
  solicitudes: SolicitudAuditoria[],
  plan: Map<string, ClientePlan>,
  opciones: { version: VersionPlan; hasta: string; modo: 'semana' | 'acumulado'; analisis?: FilaPlan[] },
): ClienteAvance[] {
  const { version, hasta, modo } = opciones
  const visibles = opciones.analisis ?? ['residuales', 'fsma', 'fito']
  const clientes = new Map<string, ClienteAvance>()
  const plantaDe = new Map<string, PlantaAvance>()

  const cliente = (nombre: string, conPlan: boolean) => {
    const k = normalizarNombre(nombre)
    let c = clientes.get(k)
    if (!c) {
      c = { cliente: nombre, celdas: vacias(), plantas: [], conPlan }
      clientes.set(k, c)
    }
    return c
  }
  const planta = (c: ClienteAvance, nombre: string | null) => {
    const k = `${normalizarNombre(c.cliente)}|${nombre === null ? '' : normalizarNombre(nombre)}`
    let p = plantaDe.get(k)
    if (!p) {
      p = { planta: nombre, celdas: vacias() }
      plantaDe.set(k, p)
      c.plantas.push(p)
    }
    return p
  }

  // Lo que tocaba.
  for (const cp of plan.values()) {
    const semanas = cp.semanas ?? []
    if (semanas.length === 0) continue
    const c = cliente(cp.sold_to, true)
    for (const s of semanas) {
      if (!visibles.includes(s.servicio) || !cuenta(s.semana, hasta, modo)) continue
      const n = version === 'original' ? s.original : s.propuesta
      c.celdas[s.servicio].debia += n
      planta(c, s.planta).celdas[s.servicio].debia += n
    }
    // Aunque una planta no tenga nada esa semana, aparece (con 0) para ver todo el cliente.
    for (const s of semanas) planta(c, s.planta)
  }

  // Lo hecho.
  for (const s of solicitudes) {
    const lab = laboratorioDe(s)
    const nombre = (s.sold_to ?? '').trim()
    if (!lab || !nombre) continue
    const servicio = servicioDeLab(lab)
    if (!visibles.includes(servicio)) continue
    if (!cuenta(semanaDeFecha(s.fecha_muestreo ?? s.fecha_solicitud ?? s.emitida_en), hasta, modo)) continue
    const k = normalizarNombre(nombre)
    const c = clientes.get(k) ?? cliente(nombre, false)
    const del = (celdas: CeldasAvance) => {
      celdas[servicio].hecho++
      if (servicio === 'residuales') {
        if (lab === 'AGROFRESH') celdas.residuales.agrofresh = (celdas.residuales.agrofresh ?? 0) + 1
        else celdas.residuales.quiteca = (celdas.residuales.quiteca ?? 0) + 1
      }
    }
    del(c.celdas)
    const ship = normalizarNombre(s.ship_to ?? '')
    const propia = ship ? plantaDe.get(`${k}|${ship}`) : undefined
    del((propia ?? planta(c, null)).celdas)
  }

  const total = (c: ClienteAvance) => FILAS.reduce((n, f) => n + c.celdas[f].debia, 0)
  return [...clientes.values()]
    .map((c) => ({
      ...c,
      // Primero las plantas con algo, y «sin cruzar» al final.
      plantas: c.plantas
        .filter((p) => FILAS.some((f) => p.celdas[f].hecho > 0 || p.celdas[f].debia > 0))
        .sort((a, b) => (a.planta === null ? 1 : b.planta === null ? -1 : a.planta.localeCompare(b.planta, 'es'))),
    }))
    .filter((c) => FILAS.some((f) => c.celdas[f].hecho > 0 || c.celdas[f].debia > 0))
    .sort((a, b) => total(b) - total(a) || a.cliente.localeCompare(b.cliente, 'es'))
}

const FILAS: FilaPlan[] = ['residuales', 'fsma', 'fito']

/** La semana de la temporada que corresponde a hoy; si hoy está antes de W41 es la primera, y si pasó W02, la última. */
export function semanaActual(hoy: Date = new Date()): string {
  const iso = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
  const s = semanaDeFecha(iso)
  if (s) return s
  return hoy.getTime() < Date.UTC(2026, 9, 5) ? SEMANAS_PLAN[0] : SEMANAS_PLAN[SEMANAS_PLAN.length - 1]
}

/** Suma de todas las celdas de una lista de clientes (la fila Total). */
export function sumarAvance(clientes: ClienteAvance[]): CeldasAvance {
  const t = vacias()
  for (const c of clientes) {
    for (const f of FILAS) {
      t[f].hecho += c.celdas[f].hecho
      t[f].debia += c.celdas[f].debia
    }
    t.residuales.agrofresh = (t.residuales.agrofresh ?? 0) + (c.celdas.residuales.agrofresh ?? 0)
    t.residuales.quiteca = (t.residuales.quiteca ?? 0) + (c.celdas.residuales.quiteca ?? 0)
  }
  return t
}
