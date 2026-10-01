import type { FiltrosReporte } from './filtros'
import type { Observacion } from './tipos'

/** Encabezado del gráfico principal: parte siempre con «Residuales» (o el prefijo dado) y suma lo
 * que esté filtrado, en este orden: Sold To + Ship To, servicio, especie,
 * variedad e ingredientes. Los ingredientes solo salen si se acotaron: con
 * todos puestos (lo normal) no aportan nada al título. */
export function tituloGrafico(f: FiltrosReporte, mostrarCliente = true, prefijo = 'Residuales'): string {
  const partes = [
    (mostrarCliente ? [f.cliente, f.planta] : []).filter(Boolean).join(' '),
    f.tipoServicio,
    f.crop,
    f.variedad,
    f.ingredientes.join(', '),
  ].filter((p) => p.trim() !== '')
  return [prefijo, ...partes].join(' - ')
}

/** Un informe (solicitud) con los puntos que se dibujan en su columna. */
export interface InformeConPuntos {
  solicitudId: number
  nroSolicitud: string
  fecha: string | null
  puntos: Observacion[]
}

/** Cada informe es una columna del gráfico: la fecha se repite tantas veces
 * como informes tenga ese día, y los analitos del informe quedan uno sobre
 * otro según su ppm. Solo cuentan los resultados con valor numérico. Orden:
 * fecha (sin fecha al final) y luego N° de solicitud. */
export function informesConPuntos(obs: Observacion[]): InformeConPuntos[] {
  const grupos = new Map<number, InformeConPuntos>()
  obs.forEach((o) => {
    if (o.ppm == null || !o.ingrediente) return
    const g = grupos.get(o.solicitudId) ?? {
      solicitudId: o.solicitudId,
      nroSolicitud: o.nroSolicitud,
      fecha: o.fecha,
      puntos: [],
    }
    g.puntos.push(o)
    grupos.set(o.solicitudId, g)
  })
  return [...grupos.values()].sort((a, b) => {
    if (a.fecha !== b.fecha) {
      if (!a.fecha) return 1
      if (!b.fecha) return -1
      return a.fecha.localeCompare(b.fecha)
    }
    return (a.nroSolicitud ?? '').localeCompare(b.nroSolicitud ?? '', 'es', { numeric: true })
  })
}

/** Paleta de verdes y amarillos de AgroFresh para «Informes por especie»
 * (en vez de la categórica de analitos, que ahí se leía como un arcoíris).
 * Pasada la última, esa especie va a «Otras» en gris. */
const PALETA_ESPECIES = ['#4f8a26', '#e8c32e', '#6dad3c', '#c9a227', '#a3cf62', '#f2dc7a', '#2f6b1f']

export function colorEspecieMarca(posicion: number): string | null {
  return PALETA_ESPECIES[posicion] ?? null
}
