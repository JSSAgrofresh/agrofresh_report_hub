import type { InformeConPuntos } from './graficoResiduales'
import { desvioResidual, especieDeInforme, limitesDeInforme } from './limitesResiduales'

/** Un resultado que quedó fuera de la franja de la tabla de SU especie. */
export interface ResultadoFuera {
  solicitudId: number
  nroSolicitud: string
  cliente: string
  especie: string
  analito: string
  ppm: number
  min: number
  max: number
  /** Cuánto se pasó: positivo sobre el máximo, negativo bajo el mínimo. */
  desvio: number
}

type Clase = 'sobre' | 'bajo' | 'dentro'

interface Juzgado {
  inf: InformeConPuntos
  cliente: string
  /** Semana de muestreo del informe (null si no la trae). */
  semana: number | null
  especie: string
  /** Un informe con algún resultado sobre el máximo es «sobre» (aunque otro quede bajo): así cada informe cuenta una sola vez. */
  clase: Clase
  fuera: ResultadoFuera[]
  /** Cuántos de sus resultados tenían franja. */
  evaluados: { analito: string; fuera: boolean }[]
}

/** Solo los informes con franja en la tabla (su especie y al menos un analito con límite). Orden de entrada. */
function juzgar(informes: InformeConPuntos[]): Juzgado[] {
  const out: Juzgado[] = []
  for (const inf of informes) {
    const lim = limitesDeInforme(inf)
    if (!lim) continue
    const especie = especieDeInforme(inf)
    const cliente = String(inf.puntos.find((p) => p.cliente && String(p.cliente).trim())?.cliente ?? '').trim() || 'Sin cliente'
    const fuera: ResultadoFuera[] = []
    const evaluados: Juzgado['evaluados'] = []
    for (const p of inf.puntos) {
      if (p.ppm == null || !p.ingrediente || !lim[p.ingrediente]) continue
      const d = desvioResidual(p.ingrediente, p.ppm, lim)
      evaluados.push({ analito: p.ingrediente, fuera: d !== 0 })
      if (d !== 0) {
        const r = lim[p.ingrediente]
        fuera.push({ solicitudId: inf.solicitudId, nroSolicitud: inf.nroSolicitud, cliente, especie, analito: p.ingrediente, ppm: p.ppm, min: r.min, max: r.max, desvio: d })
      }
    }
    if (evaluados.length === 0) continue
    const clase: Clase = fuera.some((f) => f.desvio > 0) ? 'sobre' : fuera.length ? 'bajo' : 'dentro'
    const semana = inf.puntos.find((p) => p.semana != null)?.semana ?? null
    out.push({ inf, cliente, semana, especie, clase, fuera, evaluados })
  }
  return out
}

export interface FilaCliente {
  cliente: string
  sobre: number
  bajo: number
  dentro: number
  /** sobre + bajo: lo que ordena el gráfico. */
  fuera: number
  total: number
}

function ordenarClientes<T extends FilaCliente>(filas: T[], nombre: (f: T) => string): T[] {
  // Empatados en cantidad de informes fuera: primero el de mayor proporción fuera (1 de 1 antes que 1 de 30).
  return filas.sort((a, b) => b.fuera - a.fuera || b.fuera / b.total - a.fuera / a.total || b.total - a.total || nombre(a).localeCompare(nombre(b), 'es'))
}

function sumar(mapa: Map<string, FilaCliente>, clave: string, j: Juzgado) {
  const f = mapa.get(clave) ?? { cliente: clave, sobre: 0, bajo: 0, dentro: 0, fuera: 0, total: 0 }
  f[j.clase] += 1
  f.total += 1
  f.fuera = f.sobre + f.bajo
  mapa.set(clave, f)
}

/**
 * «Fuera de rango por cliente»: por cada cliente, cuántos de sus informes quedaron sobre el límite, bajo el límite o
 * dentro. Los números son SIEMPRE los reales (la barra decide si muestra el 100% de los informes o solo lo fuera de
 * rango). Va primero quien tiene MÁS informes fuera de rango, no quien tiene más informes. Con `soloFuera` se
 * quitan los clientes sin ningún informe fuera de rango.
 */
export function fueraPorCliente(informes: InformeConPuntos[], soloFuera: boolean): FilaCliente[] {
  const mapa = new Map<string, FilaCliente>()
  for (const j of juzgar(informes)) sumar(mapa, j.cliente, j)
  let filas = [...mapa.values()]
  if (soloFuera) filas = filas.filter((f) => f.fuera > 0)
  return ordenarClientes(filas, (f) => f.cliente)
}

export interface FilaSemana extends FilaCliente {
  /** Semana de muestreo; null = informes sin semana. */
  semana: number | null
  /** La fecha más reciente de sus informes: ordena de lo nuevo a lo viejo (una temporada cruza el año). */
  ultimaFecha: string
}

/** Las semanas de UN cliente (se despliegan al abrirlo), de la más reciente a la más antigua. */
export function fueraPorSemana(informes: InformeConPuntos[], cliente: string, soloFuera: boolean): FilaSemana[] {
  const mapa = new Map<string, FilaSemana>()
  for (const j of juzgar(informes)) {
    if (j.cliente !== cliente) continue
    const clave = j.semana == null ? 'sin' : String(j.semana)
    const f = mapa.get(clave) ?? { cliente, semana: j.semana, ultimaFecha: '', sobre: 0, bajo: 0, dentro: 0, fuera: 0, total: 0 }
    f[j.clase] += 1
    f.total += 1
    f.fuera = f.sobre + f.bajo
    if ((j.inf.fecha ?? '') > f.ultimaFecha) f.ultimaFecha = j.inf.fecha ?? ''
    mapa.set(clave, f)
  }
  const filas = [...mapa.values()].filter((f) => !soloFuera || f.fuera > 0)
  return filas.sort((a, b) => b.ultimaFecha.localeCompare(a.ultimaFecha) || (b.semana ?? -1) - (a.semana ?? -1))
}

export interface FilaDona {
  /** Especie o analito. */
  nombre: string
  /** Lo que mide el tramo completo: informes (por especie) o resultados (por analito). */
  total: number
  fuera: number
}

/** Por especie (informes). Orden: más fuera de rango primero. */
export function donaPorEspecie(informes: InformeConPuntos[]): FilaDona[] {
  const mapa = new Map<string, FilaDona>()
  for (const j of juzgar(informes)) {
    const nombre = j.especie || 'Sin especie'
    const f = mapa.get(nombre) ?? { nombre, total: 0, fuera: 0 }
    f.total += 1
    if (j.clase !== 'dentro') f.fuera += 1
    mapa.set(nombre, f)
  }
  return ordenar([...mapa.values()])
}

/** Por analito (resultados) de los informes dados: se usa con UNA especie filtrada. */
export function donaPorAnalito(informes: InformeConPuntos[]): FilaDona[] {
  const mapa = new Map<string, FilaDona>()
  for (const j of juzgar(informes)) {
    for (const e of j.evaluados) {
      const f = mapa.get(e.analito) ?? { nombre: e.analito, total: 0, fuera: 0 }
      f.total += 1
      if (e.fuera) f.fuera += 1
      mapa.set(e.analito, f)
    }
  }
  return ordenar([...mapa.values()])
}

function ordenar(filas: FilaDona[]): FilaDona[] {
  return filas.sort((a, b) => b.fuera - a.fuera || b.total - a.total || a.nombre.localeCompare(b.nombre, 'es'))
}

/** El detalle: cada resultado fuera de rango, el que más se pasó primero. `especie`/`analito` acotan. */
export function detalleFuera(informes: InformeConPuntos[], acotar: { especie?: string; analito?: string; cliente?: string; semana?: number | null } = {}): ResultadoFuera[] {
  const norm = (s: string) => s.trim().toLowerCase()
  return juzgar(informes)
    .filter((j) => !acotar.especie || norm(j.especie || 'Sin especie') === norm(acotar.especie))
    .filter((j) => !acotar.cliente || j.cliente === acotar.cliente)
    .filter((j) => acotar.semana === undefined || j.semana === acotar.semana)
    .flatMap((j) => j.fuera)
    .filter((f) => !acotar.analito || f.analito === acotar.analito)
    .sort((a, b) => Math.abs(b.desvio) - Math.abs(a.desvio) || a.nroSolicitud.localeCompare(b.nroSolicitud, 'es', { numeric: true }))
}

export interface FilaPorAnalito {
  analito: string
  min: number
  max: number
  fuera: number
  sobre: number
  bajo: number
  desvioPromedio: number
  mayorDesvio: number
}

/** El detalle agrupado por analito: cuántos fuera, desvío promedio y mayor desvío (con signo). */
export function agruparPorAnalito(filas: ResultadoFuera[]): FilaPorAnalito[] {
  const mapa = new Map<string, ResultadoFuera[]>()
  filas.forEach((f) => mapa.set(f.analito, [...(mapa.get(f.analito) ?? []), f]))
  return [...mapa.entries()]
    .map(([analito, fs]) => ({
      analito,
      min: Math.min(...fs.map((f) => f.min)),
      max: Math.max(...fs.map((f) => f.max)),
      fuera: fs.length,
      sobre: fs.filter((f) => f.desvio > 0).length,
      bajo: fs.filter((f) => f.desvio < 0).length,
      desvioPromedio: fs.reduce((t, f) => t + Math.abs(f.desvio), 0) / fs.length,
      mayorDesvio: fs.reduce((m, f) => (Math.abs(f.desvio) > Math.abs(m) ? f.desvio : m), 0),
    }))
    .sort((a, b) => b.fuera - a.fuera || Math.abs(b.mayorDesvio) - Math.abs(a.mayorDesvio) || a.analito.localeCompare(b.analito, 'es'))
}
