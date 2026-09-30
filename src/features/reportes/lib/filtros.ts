import type { Observacion } from './tipos'

/** Rango del calendario de Report: fechas ISO (YYYY-MM-DD), ambos extremos incluidos. */
export interface RangoFiltro {
  desde: string
  hasta: string
}

export interface FiltrosReporte {
  ingredientes: string[]
  cliente: string
  planta: string
  tipoAplicacion: string
  tipoServicio: string
  laboratorio: string
  crop: string
  variedad: string
  semana: string
  mes: string
  rango: RangoFiltro | null
}

export const FILTROS_VACIOS: FiltrosReporte = {
  ingredientes: [],
  cliente: '',
  planta: '',
  tipoAplicacion: '',
  tipoServicio: '',
  laboratorio: '',
  crop: '',
  variedad: '',
  semana: '',
  mes: '',
  rango: null,
}

/** Filtros de texto de un solo valor: los que tienen un desplegable propio. */
export type CampoTexto = 'cliente' | 'planta' | 'tipoAplicacion' | 'tipoServicio' | 'laboratorio' | 'crop' | 'variedad'
export type CampoFiltro = CampoTexto | 'ingredientes' | 'semana' | 'mes' | 'rango'

/** Misma clave que `clave_normalizada` del backend (listados.py): sin
 * mayúsculas, acentos, puntuación ni espacios de más. Así "A.G. Servicios SpA"
 * y "AG SERVICIOS SPA", o "Arándano" y "ARANDANO", son el mismo valor para el
 * filtro -antes solo se ignoraban las mayúsculas, y una tilde o un punto de
 * diferencia dejaba el filtro en 0 resultados o repetía la opción-. */
export function claveFiltro(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined) return ''
  return String(valor)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    // El punto y el apóstrofo se borran (no se cambian por espacio): si no,
    // "A.G." queda "a g" y no calza con "AG".
    .replace(/[.'’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function mismoValor(a: string | number | null | undefined, b: string | number | null | undefined): boolean {
  return claveFiltro(a) === claveFiltro(b)
}

function valorDe(o: Observacion, campo: CampoTexto | 'semana' | 'mes' | 'ingredientes'): string | number | null {
  switch (campo) {
    case 'cliente':
      return o.cliente
    case 'planta':
      return o.planta
    case 'tipoAplicacion':
      return o.tipoAplicacion
    case 'tipoServicio':
      return o.tipoServicio
    case 'laboratorio':
      return o.laboratorio
    case 'crop':
      return o.crop
    case 'variedad':
      return o.variedad
    case 'semana':
      return o.semana
    case 'mes':
      return o.mes
    case 'ingredientes':
      return o.ingrediente
  }
}

const CAMPOS_TEXTO: CampoTexto[] = ['cliente', 'planta', 'tipoAplicacion', 'tipoServicio', 'laboratorio', 'crop', 'variedad']

/** ¿La observación pasa todos los filtros? `excepto` deja fuera uno: es lo que
 * se usa para armar las opciones de ese mismo desplegable (ver `opcionesDe`). */
export function cumpleFiltros(o: Observacion, f: FiltrosReporte, excepto?: CampoFiltro): boolean {
  for (const campo of CAMPOS_TEXTO) {
    if (campo !== excepto && f[campo] && !mismoValor(valorDe(o, campo), f[campo])) return false
  }
  if (excepto !== 'ingredientes' && f.ingredientes.length > 0) {
    if (o.ingrediente == null || !f.ingredientes.some((i) => mismoValor(i, o.ingrediente))) return false
  }
  // Semana/Mes y el calendario son excluyentes en la pantalla: solo uno de los
  // dos grupos tiene valor a la vez.
  if (excepto !== 'semana' && f.semana && String(o.semana ?? '') !== f.semana) return false
  if (excepto !== 'mes' && f.mes && String(o.mes ?? '') !== f.mes) return false
  if (excepto !== 'rango' && f.rango) {
    if (o.fecha == null || o.fecha < f.rango.desde || o.fecha > f.rango.hasta) return false
  }
  return true
}

export function aplicarFiltros(obs: Observacion[], f: FiltrosReporte, excepto?: CampoFiltro): Observacion[] {
  return obs.filter((o) => cumpleFiltros(o, f, excepto))
}

export interface OpcionFiltro {
  valor: string
  /** Solicitudes distintas que quedan si se elige esta opción. */
  conteo: number
}

interface OpcionesConfig {
  /** Nombres oficiales (Listados): si una variante calza con uno, se muestra
   * el oficial en vez del texto como vino. */
  canonicos?: string[]
  /** Arreglo solo visual del texto que se muestra (ej. mayúscula inicial). */
  formatear?: (s: string) => string
  /** Lo que ya está elegido: siempre aparece, aunque con los demás filtros
   * haya quedado en 0 -si no, el desplegable diría "Todos" mientras por
   * detrás sigue filtrando-. */
  seleccionados?: string[]
  orden?: 'texto' | 'numero'
}

/** Opciones de un desplegable, cada una con cuántas solicitudes trae.
 *
 * `obs` tiene que venir filtrado por todos los DEMÁS filtros
 * (`aplicarFiltros(obs, f, campo)`): así Especie, con un Sold To elegido,
 * ofrece solo las especies que ese cliente tiene de verdad, en vez de la lista
 * completa donde casi todo da 0 resultados. Las variantes que solo difieren en
 * tildes, mayúsculas o puntuación se juntan en una sola opción. */
export function opcionesDe(
  obs: Observacion[],
  campo: CampoTexto | 'semana' | 'mes' | 'ingredientes',
  config: OpcionesConfig = {},
): OpcionFiltro[] {
  const { canonicos = [], formatear = (s: string) => s, seleccionados = [], orden = 'texto' } = config
  const oficialPorClave = new Map(canonicos.map((c) => [claveFiltro(c), c]))
  const grupos = new Map<string, { variantes: Map<string, number>; solicitudes: Set<number> }>()

  obs.forEach((o) => {
    const crudo = valorDe(o, campo)
    const clave = claveFiltro(crudo)
    if (!clave) return
    const texto = String(crudo).trim()
    const grupo = grupos.get(clave) ?? { variantes: new Map<string, number>(), solicitudes: new Set<number>() }
    grupo.variantes.set(texto, (grupo.variantes.get(texto) ?? 0) + 1)
    grupo.solicitudes.add(o.solicitudId)
    grupos.set(clave, grupo)
  })

  const opciones: OpcionFiltro[] = []
  grupos.forEach((grupo, clave) => {
    let masFrecuente = ''
    let n = -1
    grupo.variantes.forEach((veces, variante) => {
      if (veces > n) {
        masFrecuente = variante
        n = veces
      }
    })
    const oficial = oficialPorClave.get(clave)
    opciones.push({ valor: oficial ?? formatear(masFrecuente), conteo: grupo.solicitudes.size })
  })

  seleccionados.forEach((s) => {
    if (s && !grupos.has(claveFiltro(s))) opciones.push({ valor: s, conteo: 0 })
  })

  return opciones.sort((a, b) =>
    orden === 'numero' ? Number(a.valor) - Number(b.valor) : a.valor.localeCompare(b.valor, 'es', { numeric: true }),
  )
}

/** Clientes (Sold To) que tienen la sucursal `planta`. Si es uno solo, la
 * pantalla lo completa sola al elegir la sucursal. */
export function clientesDeSucursal(obs: Observacion[], planta: string): string[] {
  const porClave = new Map<string, string>()
  obs.forEach((o) => {
    if (o.cliente && mismoValor(o.planta, planta)) porClave.set(claveFiltro(o.cliente), o.cliente)
  })
  return [...porClave.values()]
}

/** Cuántos filtros hay puestos (el rango de fechas cuenta como uno). */
export function contarFiltrosActivos(f: FiltrosReporte): number {
  return (
    (f.ingredientes.length > 0 ? 1 : 0) +
    CAMPOS_TEXTO.filter((c) => f[c]).length +
    (f.semana ? 1 : 0) +
    (f.mes ? 1 : 0) +
    (f.rango ? 1 : 0)
  )
}
