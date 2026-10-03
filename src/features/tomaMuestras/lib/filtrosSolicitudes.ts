import type { Solicitud } from './tipos'

/** Estados que se pueden marcar en el filtro. Enviada y Pendiente son excluyentes
 * entre sí; «Sin lista de distribución» es otra cosa (a quién va el correo).
 * «Con informe» y «Sin informe» también son alternativas entre sí. */
export type EstadoFiltro = 'enviada' | 'pendiente' | 'sin_lista' | 'con_informe' | 'sin_informe' | 'sin_report' | 'ot_revisar'

/** Los filtros de la lista de solicitudes. Los que son listas se pueden marcar
 * de a varios: dentro de un mismo filtro vale cualquiera de los marcados; entre
 * filtros distintos tienen que cumplirse todos. */
export interface FiltrosSolicitudes {
  fechaDesde: string
  fechaHasta: string
  numeroSolicitud: string
  busqueda: string
  solicitante: string
  variedad: string
  laboratorio: string[]
  soldTo: string[]
  shipTo: string[]
  especie: string[]
  tipoAplicacion: string[]
  lineaProceso: string[]
  tipoMuestra: string[]
  nombreMuestreador: string[]
  estado: EstadoFiltro[]
  prueba: '' | 'solo' | 'sin'
}

export const FILTROS_VACIOS: FiltrosSolicitudes = {
  fechaDesde: '',
  fechaHasta: '',
  numeroSolicitud: '',
  busqueda: '',
  solicitante: '',
  variedad: '',
  laboratorio: [],
  soldTo: [],
  shipTo: [],
  especie: [],
  tipoAplicacion: [],
  lineaProceso: [],
  tipoMuestra: [],
  nombreMuestreador: [],
  estado: [],
  prueba: '',
}

export function hayFiltros(f: FiltrosSolicitudes): boolean {
  return Object.values(f).some((v) => (Array.isArray(v) ? v.length > 0 : v.trim() !== ''))
}

function contiene(valor: string | null | undefined, buscado: string): boolean {
  return (valor ?? '').toLowerCase().includes(buscado.toLowerCase())
}

function sinTildes(t: string): string {
  return t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Sin nada marcado no filtra; con algo marcado, el valor tiene que ser uno de ellos. */
function esUnoDe(marcados: string[], valor: string | null | undefined): boolean {
  return marcados.length === 0 || marcados.includes(valor ?? '')
}

export function tipoAplicacionDe(s: Solicitud): string {
  return s.campos_laboratorio['Tipo Aplicación'] ?? ''
}

/** Tres grupos que se suman como condiciones: envío (Enviada / Pendiente,
 * alternativas), informe (Con / Sin informe, alternativas) y «Sin lista de
 * distribución». Pendiente + Sin lista = las pendientes que van a Jorge y
 * Claudia; Enviada + Sin informe = las que esperan el informe del laboratorio. */
/** El informe tiene la OT por revisar: no calza con lo que dice el informe, o
 * sus resultados ya están en Report y el informe no trae la OT para confirmarla
 * (si aún no están en Report, eso ya lo avisa «Sin Report»). */
export function otPorRevisar(s: Solicitud): boolean {
  const v = s.informe?.verificacion
  if (!v) return false
  return v.estado === 'revisar' || (v.estado === 'sin_confirmar' && Boolean(s.informe?.en_report))
}

function cumpleEstado(s: Solicitud, estados: EstadoFiltro[]): boolean {
  if (estados.length === 0) return true
  if (estados.includes('sin_lista') && !s.sin_lista_distribucion) return false
  // Tiene informe (PDF subido) pero sus resultados no entraron a Report.
  if (estados.includes('sin_report') && !(s.informe && !s.informe.en_report)) return false
  if (estados.includes('ot_revisar') && !otPorRevisar(s)) return false
  const envio = estados.filter((e) => e === 'enviada' || e === 'pendiente')
  if (envio.length && !envio.some((e) => (e === 'enviada' ? s.enviada : !s.enviada))) return false
  const informe = estados.filter((e) => e === 'con_informe' || e === 'sin_informe')
  if (informe.length && !informe.some((e) => (e === 'con_informe' ? Boolean(s.informe) : !s.informe))) return false
  return true
}

export function filtrarSolicitudes(solicitudes: Solicitud[], f: FiltrosSolicitudes): Solicitud[] {
  const claves = f.busqueda.trim() ? sinTildes(f.busqueda.trim()).split(/\s+/) : []
  return solicitudes.filter((s) => {
    if (f.fechaDesde && s.fecha_solicitud < f.fechaDesde) return false
    if (f.fechaHasta && s.fecha_solicitud > f.fechaHasta) return false
    if (claves.length) {
      const pajar = sinTildes(
        [
          s.numero_solicitud, s.sold_to, s.ship_to, s.especie, s.variedad, s.laboratorio,
          s.generado_por, s.tipo_muestra, tipoAplicacionDe(s), ...(s.informe?.numeros ?? []),
        ].join(' '),
      )
      if (!claves.every((c) => pajar.includes(c))) return false
    }
    if (f.numeroSolicitud && !contiene(s.numero_solicitud, f.numeroSolicitud)) return false
    if (f.solicitante && !contiene(s.solicitante, f.solicitante)) return false
    if (f.variedad && !contiene(s.variedad, f.variedad)) return false
    if (!esUnoDe(f.laboratorio, s.laboratorio)) return false
    if (!esUnoDe(f.soldTo, s.sold_to)) return false
    if (!esUnoDe(f.shipTo, s.ship_to)) return false
    if (!esUnoDe(f.especie, s.especie)) return false
    if (!esUnoDe(f.tipoAplicacion, tipoAplicacionDe(s))) return false
    if (!esUnoDe(f.lineaProceso, s.linea_proceso)) return false
    if (!esUnoDe(f.tipoMuestra, s.tipo_muestra)) return false
    if (!esUnoDe(f.nombreMuestreador, s.nombre_muestreador)) return false
    if (!cumpleEstado(s, f.estado)) return false
    if (f.prueba === 'solo' && !s.es_prueba) return false
    if (f.prueba === 'sin' && s.es_prueba) return false
    return true
  })
}

export interface OpcionesFiltros {
  laboratorio: string[]
  soldTo: string[]
  shipTo: string[]
  especie: string[]
  tipoAplicacion: string[]
  lineaProceso: string[]
  tipoMuestra: string[]
  nombreMuestreador: string[]
}

/** Lo que se ofrece en cada lista, sacado de las solicitudes ya cargadas. Con
 * clientes marcados, Ship To ofrece solo sus plantas (más los Ship To que ya
 * estaban marcados, para poder desmarcarlos). */
export function opcionesDe(solicitudes: Solicitud[], f: FiltrosSolicitudes): OpcionesFiltros {
  const conjuntos = {
    laboratorio: new Set<string>(),
    soldTo: new Set<string>(),
    shipTo: new Set<string>(),
    especie: new Set<string>(),
    tipoAplicacion: new Set<string>(),
    lineaProceso: new Set<string>(),
    tipoMuestra: new Set<string>(),
    nombreMuestreador: new Set<string>(),
  }
  for (const s of solicitudes) {
    conjuntos.laboratorio.add(s.laboratorio)
    conjuntos.soldTo.add(s.sold_to)
    if (s.ship_to && (f.soldTo.length === 0 || f.soldTo.includes(s.sold_to) || f.shipTo.includes(s.ship_to))) {
      conjuntos.shipTo.add(s.ship_to)
    }
    if (s.especie) conjuntos.especie.add(s.especie)
    const ta = tipoAplicacionDe(s)
    if (ta) conjuntos.tipoAplicacion.add(ta)
    if (s.linea_proceso) conjuntos.lineaProceso.add(s.linea_proceso)
    if (s.tipo_muestra) conjuntos.tipoMuestra.add(s.tipo_muestra)
    if (s.nombre_muestreador) conjuntos.nombreMuestreador.add(s.nombre_muestreador)
  }
  const ordenar = (c: Set<string>) => [...c].filter(Boolean).sort((a, b) => a.localeCompare(b, 'es'))
  return {
    laboratorio: ordenar(conjuntos.laboratorio),
    soldTo: ordenar(conjuntos.soldTo),
    shipTo: ordenar(conjuntos.shipTo),
    especie: ordenar(conjuntos.especie),
    tipoAplicacion: ordenar(conjuntos.tipoAplicacion),
    lineaProceso: ordenar(conjuntos.lineaProceso),
    tipoMuestra: ordenar(conjuntos.tipoMuestra),
    nombreMuestreador: ordenar(conjuntos.nombreMuestreador),
  }
}

/** Las vistas rápidas de arriba de Solicitudes e informes: cada indicador es
 * también un filtro de un clic (el filtro Estado con esos valores). */
export type VistaRapida = 'todas' | 'pendientes' | 'enviadas' | 'esperando' | 'con_informe' | 'sin_report' | 'ot_revisar'

export const ESTADOS_DE_VISTA: Record<VistaRapida, EstadoFiltro[]> = {
  todas: [],
  pendientes: ['pendiente'],
  enviadas: ['enviada'],
  // Ya salieron al laboratorio y el informe todavía no vuelve.
  esperando: ['enviada', 'sin_informe'],
  con_informe: ['con_informe'],
  sin_report: ['sin_report'],
  ot_revisar: ['ot_revisar'],
}

/** Qué vista rápida corresponde al filtro Estado de ahora (null = una
 * combinación hecha a mano en el panel de filtros). */
export function vistaDeEstados(estados: EstadoFiltro[]): VistaRapida | null {
  const clave = [...estados].sort().join('|')
  for (const [vista, valores] of Object.entries(ESTADOS_DE_VISTA) as [VistaRapida, EstadoFiltro[]][]) {
    if ([...valores].sort().join('|') === clave) return vista
  }
  return null
}

/** Cuántas solicitudes hay en cada vista rápida. */
export function resumenVistas(lista: Solicitud[]): Record<VistaRapida, number> {
  const r: Record<VistaRapida, number> = { todas: 0, pendientes: 0, enviadas: 0, esperando: 0, con_informe: 0, sin_report: 0, ot_revisar: 0 }
  for (const s of lista) {
    r.todas += 1
    if (s.enviada) r.enviadas += 1
    else r.pendientes += 1
    if (s.informe) r.con_informe += 1
    if (s.enviada && !s.informe) r.esperando += 1
    if (s.informe && !s.informe.en_report) r.sin_report += 1
    if (otPorRevisar(s)) r.ot_revisar += 1
  }
  return r
}

export const ETIQUETA_ESTADO: Record<EstadoFiltro, string> = {
  enviada: 'Enviada',
  pendiente: 'Pendiente',
  sin_lista: 'Sin lista de distribución',
  con_informe: 'Con informe',
  sin_informe: 'Sin informe',
  sin_report: 'Informe sin Report',
  ot_revisar: 'OT por revisar',
}

type ClaveFiltro = Exclude<keyof FiltrosSolicitudes, 'busqueda'>

const NOMBRE_FILTRO: Record<ClaveFiltro, string> = {
  fechaDesde: 'Desde',
  fechaHasta: 'Hasta',
  numeroSolicitud: 'N°',
  solicitante: 'Solicitante',
  variedad: 'Variedad',
  laboratorio: 'Laboratorio',
  soldTo: 'Sold To',
  shipTo: 'Ship To',
  especie: 'Especie',
  tipoAplicacion: 'Tipo de aplicación',
  lineaProceso: 'Línea de proceso',
  tipoMuestra: 'Tipo muestra',
  nombreMuestreador: 'Muestreador',
  estado: 'Estado',
  prueba: 'Pruebas',
}

function fechaCorta(iso: string): string {
  const [a, m, d] = iso.split('-')
  return a && m && d ? `${d}-${m}-${a}` : iso
}

/** Los filtros puestos (sin el buscador, que se ve en su caja), como chips
 * que se quitan de a uno. */
export function chipsDeFiltros(f: FiltrosSolicitudes): { clave: ClaveFiltro; texto: string }[] {
  const chips: { clave: ClaveFiltro; texto: string }[] = []
  for (const clave of Object.keys(NOMBRE_FILTRO) as ClaveFiltro[]) {
    const v = f[clave]
    if (Array.isArray(v)) {
      if (v.length === 0) continue
      const valores = clave === 'estado' ? (v as EstadoFiltro[]).map((e) => ETIQUETA_ESTADO[e]) : (v as string[])
      chips.push({ clave, texto: `${NOMBRE_FILTRO[clave]}: ${valores.join(', ')}` })
    } else if (v.trim()) {
      const texto =
        clave === 'fechaDesde' || clave === 'fechaHasta' ? fechaCorta(v)
          : clave === 'prueba' ? (v === 'solo' ? 'solo de prueba' : 'sin las de prueba')
            : v
      chips.push({ clave, texto: `${NOMBRE_FILTRO[clave]}: ${texto}` })
    }
  }
  return chips
}

export type ClaveLista = keyof OpcionesFiltros

const VALOR_DE: Record<ClaveLista, (s: Solicitud) => string | null | undefined> = {
  laboratorio: (s) => s.laboratorio,
  soldTo: (s) => s.sold_to,
  shipTo: (s) => s.ship_to,
  especie: (s) => s.especie,
  tipoAplicacion: tipoAplicacionDe,
  lineaProceso: (s) => s.linea_proceso,
  tipoMuestra: (s) => s.tipo_muestra,
  nombreMuestreador: (s) => s.nombre_muestreador,
}

/** Las listas de los filtros se ACUMULAN: cada lista ofrece solo lo que queda
 * con todos los OTROS filtros puestos (si eliges QUITECA, Sold To muestra solo
 * clientes con solicitudes de QUITECA), con cuántas trae cada opción. Lo que
 * ya está marcado sigue en la lista aunque quede en 0, para poder desmarcarlo. */
export function opcionesAcumuladas(
  solicitudes: Solicitud[],
  f: FiltrosSolicitudes,
): { opciones: OpcionesFiltros; conteo: Record<ClaveLista, (o: string) => number> } {
  const opciones = {} as OpcionesFiltros
  const conteo = {} as Record<ClaveLista, (o: string) => number>
  for (const clave of Object.keys(VALOR_DE) as ClaveLista[]) {
    const base = filtrarSolicitudes(solicitudes, { ...f, [clave]: [] })
    const n = new Map<string, number>()
    for (const s of base) {
      const v = VALOR_DE[clave](s)
      if (v) n.set(v, (n.get(v) ?? 0) + 1)
    }
    for (const marcado of f[clave]) if (!n.has(marcado)) n.set(marcado, 0)
    opciones[clave] = [...n.keys()].filter(Boolean).sort((a, b) => a.localeCompare(b, 'es'))
    conteo[clave] = (o: string) => n.get(o) ?? 0
  }
  return { opciones, conteo }
}

/** Cuánto duran los filtros guardados: una jornada desde el último cambio. */
export const VIGENCIA_FILTROS_MS = 8 * 60 * 60 * 1000

interface Almacen {
  getItem(clave: string): string | null
  setItem(clave: string, valor: string): void
  removeItem(clave: string): void
}

export function claveFiltrosGuardados(email: string | null | undefined): string {
  return `agrofresh.solicitudes.filtros.${(email ?? '').trim().toLowerCase() || 'anonimo'}`
}

/** Guarda los filtros con la hora; sin filtros, borra lo guardado. */
export function guardarFiltros(almacen: Almacen, clave: string, f: FiltrosSolicitudes, ahora: number): void {
  if (!hayFiltros(f)) {
    almacen.removeItem(clave)
    return
  }
  almacen.setItem(clave, JSON.stringify({ guardado: ahora, filtros: f }))
}

/** Los filtros guardados si todavía están vigentes; si vencieron o están
 * dañados, se borran y se parte limpio. Solo se toman las claves conocidas,
 * con su tipo: algo viejo o editado a mano no puede romper la pantalla. */
export function leerFiltros(almacen: Almacen, clave: string, ahora: number): FiltrosSolicitudes {
  const crudo = almacen.getItem(clave)
  if (!crudo) return FILTROS_VACIOS
  try {
    const { guardado, filtros } = JSON.parse(crudo) as { guardado: number; filtros: Partial<FiltrosSolicitudes> }
    if (typeof guardado !== 'number' || ahora - guardado > VIGENCIA_FILTROS_MS || ahora < guardado) {
      almacen.removeItem(clave)
      return FILTROS_VACIOS
    }
    const salida = { ...FILTROS_VACIOS }
    for (const k of Object.keys(FILTROS_VACIOS) as (keyof FiltrosSolicitudes)[]) {
      const v = filtros?.[k]
      if (Array.isArray(FILTROS_VACIOS[k])) {
        if (Array.isArray(v) && v.every((x) => typeof x === 'string')) (salida as Record<string, unknown>)[k] = v
      } else if (typeof v === 'string') {
        (salida as Record<string, unknown>)[k] = v
      }
    }
    if (!['', 'solo', 'sin'].includes(salida.prueba)) salida.prueba = ''
    salida.estado = salida.estado.filter((e) => e in ETIQUETA_ESTADO)
    return salida
  } catch {
    almacen.removeItem(clave)
    return FILTROS_VACIOS
  }
}
