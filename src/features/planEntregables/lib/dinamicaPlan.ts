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

export type NivelDinamica = 'comercial' | 'tipo' | 'cliente' | 'planta'

/** Un renglón de la tabla dinámica: un comercial, un tipo de cliente, un cliente o una planta, con sus semanas por análisis. */
export interface NodoDinamica {
  clave: string
  nombre: string
  nivel: NivelDinamica
  datos: PorServicio
  hijos: NodoDinamica[]
  /** Una planta con análisis hechos que no se pudo cruzar con una planta del plan. */
  sinCruzar?: boolean
  /** Un cliente o comercial que no está en el plan. */
  fueraDelPlan?: boolean
}

export const FUERA_DEL_PLAN = 'Fuera del plan'
export const SIN_COMERCIAL = 'Sin comercial'
export const SIN_TIPO = 'Sin tipo'

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
 * La tabla dinámica del plan, como la del Excel de José pero con el detalle del sistema: Comercial → Tipo de cliente → Cliente → Planta,
 * con una columna por semana (W41…W02) y, en cada renglón, una línea por análisis (Residuales, FSMA, FITO). Cada celda lleva lo HECHO
 * (solicitudes por laboratorio, en la semana de su muestreo) y lo PROPUESTO por el plan.
 * Lo hecho por clientes que el plan no trae va al final, bajo «Fuera del plan». Una solicitud se cruza con una planta del plan solo si su
 * Ship To se llama igual (sin tildes ni mayúsculas); si no, queda en «Sin cruzar con una planta del plan».
 */
export function construirDinamica(solicitudes: SolicitudAuditoria[], plan: Map<string, ClientePlan> | null): NodoDinamica[] {
  const raices = new Map<string, NodoDinamica>()
  const hijoDe = (padre: NodoDinamica | null, clave: string, nombre: string, nivel: NivelDinamica, extra: Partial<NodoDinamica> = {}) => {
    const lista = padre ? padre.hijos : null
    const id = `${padre?.clave ?? ''}|${normalizarNombre(clave)}`
    let n = lista ? lista.find((h) => h.clave === id) : raices.get(id)
    if (!n) {
      n = { clave: id, nombre, nivel, datos: vacio(), hijos: [], ...extra }
      if (lista) lista.push(n)
      else raices.set(id, n)
    }
    return n
  }
  const cadena = (com: string, tipo: string, cliente: string, planta: string | null, extra: { cliente?: Partial<NodoDinamica>; planta?: Partial<NodoDinamica>; fuera?: boolean } = {}) => {
    const f = extra.fuera ? { fueraDelPlan: true } : {}
    const c = hijoDe(null, com, com, 'comercial', f)
    const t = hijoDe(c, tipo, tipo, 'tipo', f)
    const k = hijoDe(t, cliente, cliente, 'cliente', { ...f, ...extra.cliente })
    const p = planta === null ? hijoDe(k, '·sin cruzar·', 'Sin cruzar con una planta del plan', 'planta', { sinCruzar: true }) : hijoDe(k, planta, planta, 'planta', extra.planta)
    return [c, t, k, p]
  }

  // Cada cliente del plan cuelga de SU comercial y SU tipo (los que más se repiten en sus filas).
  const dondeEsta = new Map<string, { com: string; tipo: string; cliente: string }>()
  const clientes = new Map<string, NodoDinamica>()
  for (const cp of plan?.values() ?? []) {
    const semanas = cp.semanas ?? []
    if (semanas.length === 0) continue
    const com = moda(semanas.map((s) => s.comercial ?? cp.comercial), SIN_COMERCIAL)
    const tipo = moda(semanas.map((s) => s.tipo_cliente), SIN_TIPO)
    dondeEsta.set(normalizarNombre(cp.sold_to), { com, tipo, cliente: cp.sold_to })
    for (const s of semanas) {
      if (!SEMANAS_PLAN.includes(s.semana)) continue
      const nodos = cadena(com, tipo, cp.sold_to, s.planta)
      clientes.set(normalizarNombre(cp.sold_to), nodos[2])
      for (const n of nodos) sumar(n.datos, s.servicio, s.semana, { prop: s.propuesta })
    }
  }

  // Lo hecho.
  for (const s of solicitudes) {
    const lab = laboratorioDe(s)
    const nombre = (s.sold_to ?? '').trim()
    const semana = semanaDeSolicitud(s)
    if (!lab || !nombre || !semana) continue
    const serv = servicioDeLab(lab)
    const donde = dondeEsta.get(normalizarNombre(nombre))
    const ship = (s.ship_to ?? '').trim()
    let nodos: NodoDinamica[]
    if (donde) {
      // ¿La planta existe en el plan? Si no, queda «sin cruzar».
      const cli = clientes.get(normalizarNombre(nombre))
      const existe = !!ship && !!cli && cli.hijos.some((p) => !p.sinCruzar && p.clave.endsWith(`|${normalizarNombre(ship)}`))
      nodos = cadena(donde.com, donde.tipo, donde.cliente, existe ? ship : null)
    } else {
      nodos = cadena(FUERA_DEL_PLAN, '—', nombre, ship || 'Sin Ship To', { fuera: true })
    }
    for (const n of nodos) {
      sumar(n.datos, serv, semana, { hecho: 1, agrofresh: lab === 'AGROFRESH' ? 1 : 0, quiteca: lab === 'QUITECA' ? 1 : 0 })
    }
  }

  // Orden: lo que más se promete / hace primero; «Fuera del plan» y «sin cruzar» al final.
  const peso = (n: NodoDinamica) => FILAS_PLAN.reduce((a, s) => a + Math.max(totalDe(n.datos, s).prop, totalDe(n.datos, s).hecho), 0)
  const ordenar = (lista: NodoDinamica[]): NodoDinamica[] => {
    lista.forEach((n) => { n.hijos = ordenar(n.hijos) })
    return lista.sort((a, b) =>
      Number(!!a.fueraDelPlan) - Number(!!b.fueraDelPlan) || Number(!!a.sinCruzar) - Number(!!b.sinCruzar) || peso(b) - peso(a) || a.nombre.localeCompare(b.nombre, 'es'))
  }
  return ordenar([...raices.values()])
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
