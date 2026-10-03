import type { Solicitud } from './tipos'

/** Estados que se pueden marcar en el filtro. Enviada y Pendiente son excluyentes
 * entre sí; «Sin lista de distribución» es otra cosa (a quién va el correo).
 * «Con informe» y «Sin informe» también son alternativas entre sí. */
export type EstadoFiltro = 'enviada' | 'pendiente' | 'sin_lista' | 'con_informe' | 'sin_informe' | 'sin_report'

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
function cumpleEstado(s: Solicitud, estados: EstadoFiltro[]): boolean {
  if (estados.length === 0) return true
  if (estados.includes('sin_lista') && !s.sin_lista_distribucion) return false
  // Tiene informe (PDF subido) pero sus resultados no entraron a Report.
  if (estados.includes('sin_report') && !(s.informe && !s.informe.en_report)) return false
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
export type VistaRapida = 'todas' | 'pendientes' | 'enviadas' | 'esperando' | 'con_informe' | 'sin_report'

export const ESTADOS_DE_VISTA: Record<VistaRapida, EstadoFiltro[]> = {
  todas: [],
  pendientes: ['pendiente'],
  enviadas: ['enviada'],
  // Ya salieron al laboratorio y el informe todavía no vuelve.
  esperando: ['enviada', 'sin_informe'],
  con_informe: ['con_informe'],
  sin_report: ['sin_report'],
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
  const r: Record<VistaRapida, number> = { todas: 0, pendientes: 0, enviadas: 0, esperando: 0, con_informe: 0, sin_report: 0 }
  for (const s of lista) {
    r.todas += 1
    if (s.enviada) r.enviadas += 1
    else r.pendientes += 1
    if (s.informe) r.con_informe += 1
    if (s.enviada && !s.informe) r.esperando += 1
    if (s.informe && !s.informe.en_report) r.sin_report += 1
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
