import type { Bloque, Bloques, CeldaBloque, Conteo, FilaPlanta, FilaRendimiento, FilaSemana } from './tipos'

export const BLOQUES: { id: Bloque; titulo: string }[] = [
  { id: 'residuales', titulo: 'Residuales' },
  { id: 'fsma', titulo: 'FSMA (Microbiología)' },
  { id: 'fito', titulo: 'FITO (Fitopatología)' },
]

/** Desde este % de «No cumple» una fila se marca con riesgo (en rojo). Corte por confirmar con el laboratorio. */
export const UMBRAL_RIESGO = 40

const conteoVacio = (): Conteo => ({ cumple: 0, noCumple: 0 })
const celdaVacia = (): CeldaBloque => ({ linea: conteoVacio(), actimist: conteoVacio(), ecofog: conteoVacio(), total: conteoVacio() })
export const bloquesVacios = (): Bloques => ({ residuales: celdaVacia(), fsma: celdaVacia(), fito: celdaVacia() })

export const informesDe = (c: Conteo) => c.cumple + c.noCumple
/** % de informes que NO cumplen, o `null` si no hubo informes (un 0 % falso no debe mejorar el promedio). */
export const pctNoCumple = (c: Conteo): number | null => (informesDe(c) === 0 ? null : (100 * c.noCumple) / informesDe(c))

/** General = promedio simple del % No cumple de los análisis que tuvieron informes (cada análisis pesa lo mismo). */
export function porcentajeGeneral(b: Bloques): number | null {
  const valores = (['residuales', 'fsma', 'fito'] as const).map((k) => pctNoCumple(b[k].total)).filter((v): v is number => v !== null)
  return valores.length === 0 ? null : valores.reduce((a, v) => a + v, 0) / valores.length
}

function sumarEn(b: Bloques, f: FilaRendimiento) {
  const celda = b[f.bloque]
  const parte = f.servicio === 'actimist' ? celda.actimist : f.servicio === 'ecofog' ? celda.ecofog : celda.linea
  parte.cumple += f.cumple
  parte.noCumple += f.no_cumple
  celda.total.cumple += f.cumple
  celda.total.noCumple += f.no_cumple
}

export function sumarBloques(lista: Bloques[]): Bloques {
  const t = bloquesVacios()
  for (const b of lista)
    for (const k of ['residuales', 'fsma', 'fito'] as const)
      for (const p of ['linea', 'actimist', 'ecofog', 'total'] as const) {
        t[k][p].cumple += b[k][p].cumple
        t[k][p].noCumple += b[k][p].noCumple
      }
  return t
}

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** Solo las filas cuya semana cae entre las dos fechas (inclusive: la semana de `desde` y la de `hasta`). Vacío = sin tope. */
export function filtrarPorFecha(filas: FilaRendimiento[], desde: string, hasta: string): FilaRendimiento[] {
  const piso = desde ? lunesDe(desde) : ''
  return filas.filter((f) => (!piso || f.semana >= piso) && (!hasta || f.semana <= hasta))
}

/** Busca por Sold To o Ship To (sin tildes ni mayúsculas); cada palabra tiene que aparecer. */
export function buscarCliente(filas: FilaRendimiento[], texto: string): FilaRendimiento[] {
  const palabras = sinTildes(texto).split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return filas
  return filas.filter((f) => {
    const hay = sinTildes(`${f.sold_to} ${f.ship_to}`)
    return palabras.every((p) => hay.includes(p))
  })
}

export function agruparPorPlanta(filas: FilaRendimiento[], orden: 'riesgo' | 'nombre' = 'riesgo'): FilaPlanta[] {
  const mapa = new Map<string, FilaPlanta>()
  for (const f of filas) {
    const clave = `${f.sold_to}\u0000${f.ship_to}`
    let p = mapa.get(clave)
    if (!p) {
      p = { soldTo: f.sold_to, shipTo: f.ship_to, bloques: bloquesVacios(), general: null }
      mapa.set(clave, p)
    }
    sumarEn(p.bloques, f)
  }
  const lista = [...mapa.values()].map((p) => ({ ...p, general: porcentajeGeneral(p.bloques) }))
  const nombre = (a: FilaPlanta, b: FilaPlanta) => a.shipTo.localeCompare(b.shipTo, 'es') || a.soldTo.localeCompare(b.soldTo, 'es')
  return lista.sort(
    orden === 'nombre'
      ? nombre
      : (a, b) => (b.general ?? -1) - (a.general ?? -1) || nombre(a, b),
  )
}

export function agruparPorSemana(filas: FilaRendimiento[]): FilaSemana[] {
  const mapa = new Map<string, Bloques>()
  for (const f of filas) {
    const b = mapa.get(f.semana) ?? bloquesVacios()
    sumarEn(b, f)
    mapa.set(f.semana, b)
  }
  return [...mapa.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([semana, bloques]) => ({ semana, bloques, general: porcentajeGeneral(bloques) }))
}

export const conRiesgo = (general: number | null) => general !== null && general >= UMBRAL_RIESGO

// ── Fechas (AAAA-MM-DD, sin zona horaria: se calcula en UTC para que no dependa de la máquina) ──
const aFecha = (s: string) => new Date(`${s}T00:00:00Z`)
const aTexto = (d: Date) => d.toISOString().slice(0, 10)

export function lunesDe(fecha: string): string {
  const d = aFecha(fecha)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return aTexto(d)
}

export function sumarDias(fecha: string, dias: number): string {
  const d = aFecha(fecha)
  d.setUTCDate(d.getUTCDate() + dias)
  return aTexto(d)
}

/** Número de semana ISO del lunes dado. */
export function numeroSemana(lunes: string): number {
  const jueves = aFecha(sumarDias(lunes, 3))
  const inicio = new Date(Date.UTC(jueves.getUTCFullYear(), 0, 1))
  return Math.ceil(((jueves.getTime() - inicio.getTime()) / 86_400_000 + 1) / 7)
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const corta = (f: string) => `${Number(f.slice(8, 10))} ${MESES[Number(f.slice(5, 7)) - 1]}`

/** «26 oct – 1 nov» para la semana que empieza ese lunes. */
export function rangoSemana(lunes: string): string {
  return `${corta(lunes)} – ${corta(sumarDias(lunes, 6))}`
}

/** Las últimas `n` semanas que traen datos: desde el lunes de la (n-ésima) más reciente hasta la más reciente. */
export function rangoPorDefecto(filas: FilaRendimiento[], n = 5): { desde: string; hasta: string } {
  const semanas = [...new Set(filas.map((f) => f.semana))].sort()
  if (semanas.length === 0) return { desde: '', hasta: '' }
  const ultimas = semanas.slice(-n)
  return { desde: ultimas[0], hasta: sumarDias(ultimas[ultimas.length - 1], 6) }
}

export const fmtPct = (v: number | null) => (v === null ? '—' : `${Math.round(v)}%`)
