import type { SolicitudAuditoria } from '@/features/auditoriaInterna'
import type { ClientePlan } from './api'
import { SEMANAS_PLAN, laboratorioDe, semanaDeSolicitud, servicioDeLab } from './avanceSemanal'
import { normalizarNombre, type FilaPlan } from './plan'

export const FILAS_PLAN: FilaPlan[] = ['residuales', 'fsma', 'fito']

/** Lo hecho y lo prometido (propuesto) de un análisis en una semana; en residuales, también lo hecho en cada laboratorio. */
export interface CeldaDinamica {
  hecho: number
  prop: number
  agrofresh: number
  quiteca: number
}

export type PorServicio = Record<FilaPlan, Record<string, CeldaDinamica>>

export type NivelDinamica = 'cliente' | 'planta'

/** Un renglón de la tabla dinámica: un cliente (Sold To) o una de sus plantas (Ship To), con sus semanas por análisis. */
export interface NodoDinamica {
  clave: string
  nombre: string
  nivel: NivelDinamica
  datos: PorServicio
  hijos: NodoDinamica[]
  /** Solo en un cliente: quién lo lleva y qué tipo de cliente es (como vienen en el plan). */
  comercial?: string
  tipo?: string
  /** Una planta con análisis hechos que no se pudo cruzar con una planta del plan. */
  sinCruzar?: boolean
  /** Un cliente que no está en el plan. */
  fueraDelPlan?: boolean
}

export const SIN_COMERCIAL = 'Sin comercial'
export const SIN_TIPO = 'Sin tipo'

/** «Estrategico» → «Estratégico», «Estandar» → «Estándar»: el Excel trae el tipo sin tilde. */
export function tipoLegible(tipo: string): string {
  const t = tipo.trim()
  const k = t.toLowerCase()
  if (k === 'estrategico') return 'Estratégico'
  if (k === 'estandar') return 'Estándar'
  return t
}

const vacio = (): PorServicio => ({ residuales: {}, fsma: {}, fito: {} })
const celda = (): CeldaDinamica => ({ hecho: 0, prop: 0, agrofresh: 0, quiteca: 0 })

function sumar(d: PorServicio, serv: FilaPlan, semana: string, c: Partial<CeldaDinamica>) {
  const x = (d[serv][semana] ??= celda())
  x.hecho += c.hecho ?? 0
  x.prop += c.prop ?? 0
  x.agrofresh += c.agrofresh ?? 0
  x.quiteca += c.quiteca ?? 0
}

/** Suma de una fila de la tabla en todas las semanas (la columna Total). */
export function totalDe(d: PorServicio, serv: FilaPlan): CeldaDinamica {
  const t = celda()
  for (const c of Object.values(d[serv])) {
    t.hecho += c.hecho
    t.prop += c.prop
    t.agrofresh += c.agrofresh
    t.quiteca += c.quiteca
  }
  return t
}

/** Un nodo tiene algo que mostrar en los análisis visibles. */
export function conDatos(n: NodoDinamica, visibles: FilaPlan[]): boolean {
  return visibles.some((s) => {
    const t = totalDe(n.datos, s)
    return t.hecho > 0 || t.prop > 0
  })
}

/** El valor más repetido de una lista (para el comercial o el tipo de un cliente que trae varias filas). */
function moda(valores: (string | null | undefined)[], defecto: string): string {
  const cuenta = new Map<string, number>()
  for (const v of valores) {
    const t = (v ?? '').trim()
    if (t) cuenta.set(t, (cuenta.get(t) ?? 0) + 1)
  }
  return [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? defecto
}

/**
 * La tabla dinámica del plan, como la del Excel de José pero con el detalle del sistema: un renglón por cliente (Sold To) que se abre en sus
 * plantas (Ship To), con una columna por semana (W41…W02) y, en cada renglón, una línea por análisis (Residuales, FSMA, FITO). El comercial y
 * el tipo de cliente (Estratégico, Preferente, Estándar) acompañan a cada cliente como columnas. Cada celda lleva lo HECHO (solicitudes por
 * laboratorio, en la semana de su muestreo) y lo PROPUESTO por el plan.
 * Lo hecho por clientes que el plan no trae va al final, marcado «fuera del plan». Una solicitud se cruza con una planta del plan solo si su
 * Ship To se llama igual (sin tildes ni mayúsculas); si no, queda en «Sin cruzar con una planta del plan».
 */
export function construirDinamica(solicitudes: SolicitudAuditoria[], plan: Map<string, ClientePlan> | null): NodoDinamica[] {
  const clientes = new Map<string, NodoDinamica>()
  const planta = (c: NodoDinamica, nombre: string | null): NodoDinamica => {
    const id = nombre === null ? '·sin cruzar·' : normalizarNombre(nombre)
    let p = c.hijos.find((h) => h.clave === `${c.clave}|${id}`)
    if (!p) {
      p = { clave: `${c.clave}|${id}`, nombre: nombre ?? 'Sin cruzar con una planta del plan', nivel: 'planta', datos: vacio(), hijos: [], ...(nombre === null ? { sinCruzar: true } : {}) }
      c.hijos.push(p)
    }
    return p
  }

  for (const cp of plan?.values() ?? []) {
    const semanas = cp.semanas ?? []
    if (semanas.length === 0) continue
    const c: NodoDinamica = {
      clave: normalizarNombre(cp.sold_to), nombre: cp.sold_to, nivel: 'cliente', datos: vacio(), hijos: [],
      comercial: moda(semanas.map((s) => s.comercial ?? cp.comercial), SIN_COMERCIAL),
      tipo: tipoLegible(moda(semanas.map((s) => s.tipo_cliente), SIN_TIPO)),
    }
    clientes.set(c.clave, c)
    for (const s of semanas) {
      if (!SEMANAS_PLAN.includes(s.semana)) continue
      sumar(c.datos, s.servicio, s.semana, { prop: s.propuesta })
      sumar(planta(c, s.planta).datos, s.servicio, s.semana, { prop: s.propuesta })
    }
  }

  for (const s of solicitudes) {
    const lab = laboratorioDe(s)
    const nombre = (s.sold_to ?? '').trim()
    const semana = semanaDeSolicitud(s)
    if (!lab || !nombre || !semana) continue
    const k = normalizarNombre(nombre)
    let c = clientes.get(k)
    if (!c) {
      c = { clave: k, nombre, nivel: 'cliente', datos: vacio(), hijos: [], fueraDelPlan: true }
      clientes.set(k, c)
    }
    const ship = (s.ship_to ?? '').trim()
    // Con plan, una planta que el plan no trae queda «sin cruzar»; fuera del plan, cada Ship To es su propia planta.
    const existe = !!ship && c.hijos.some((p) => !p.sinCruzar && p.clave === `${c.clave}|${normalizarNombre(ship)}`)
    const p = planta(c, c.fueraDelPlan ? (ship || 'Sin Ship To') : existe ? ship : null)
    const dato = { hecho: 1, agrofresh: lab === 'AGROFRESH' ? 1 : 0, quiteca: lab === 'QUITECA' ? 1 : 0 }
    sumar(c.datos, servicioDeLab(lab), semana, dato)
    sumar(p.datos, servicioDeLab(lab), semana, dato)
  }

  // Orden: lo que más se promete o se hace primero; «fuera del plan» y «sin cruzar» al final.
  const peso = (n: NodoDinamica) => FILAS_PLAN.reduce((a, f) => a + Math.max(totalDe(n.datos, f).prop, totalDe(n.datos, f).hecho), 0)
  const ordenar = (lista: NodoDinamica[]): NodoDinamica[] => {
    lista.forEach((n) => { n.hijos = ordenar(n.hijos) })
    return lista.sort((a, b) =>
      Number(!!a.fueraDelPlan) - Number(!!b.fueraDelPlan) || Number(!!a.sinCruzar) - Number(!!b.sinCruzar) || peso(b) - peso(a) || a.nombre.localeCompare(b.nombre, 'es'))
  }
  return ordenar([...clientes.values()])
}

/** Todos los renglones de la tabla (en orden), sin los que no tienen nada en los análisis visibles, con su profundidad. Solo baja a los hijos de los nodos abiertos. */
export function aplanarDinamica(nodos: NodoDinamica[], abiertos: Set<string>, visibles: FilaPlan[]): { nodo: NodoDinamica; nivel: number }[] {
  const salida: { nodo: NodoDinamica; nivel: number }[] = []
  const rec = (lista: NodoDinamica[], nivel: number) => {
    for (const n of lista) {
      if (!conDatos(n, visibles)) continue
      salida.push({ nodo: n, nivel })
      if (abiertos.has(n.clave)) rec(n.hijos, nivel + 1)
    }
  }
  rec(nodos, 0)
  return salida
}

/** Las claves de todos los nodos que tienen hijos (para «Abrir todo»). */
export function clavesConHijos(nodos: NodoDinamica[]): string[] {
  const claves: string[] = []
  const rec = (lista: NodoDinamica[]) => lista.forEach((n) => { if (n.hijos.length) { claves.push(n.clave); rec(n.hijos) } })
  rec(nodos)
  return claves
}
