import { analitoAls, ORDEN_ALS_DESCONOCIDO } from './analitosAls'
import { analitoDiagnofruit } from './analitosDiagnofruit'
import { laboratorioBase } from './filtros'
import { textoNumero, valorDeTexto, type InformeVista } from './lineaTiempoInformes'
import type { LaboratorioTabular } from './laboratorios'
import type { Analito, Observacion } from './tipos'

/** Textos que dicen «no se detectó» (en minúscula). «<1» y otros límites («<10») se tratan aparte. */
const TEXTOS_NO_DETECTADO = new Set(['', 'nd', 'no detectado', '0', 'bld'])

/** ¿El analito se detectó en esta medición? Número > 0, o un texto que no sea «ND», «BLD», «<1»… */
export function esDetectado(o: Observacion | undefined): boolean {
  if (!o) return false
  if (o.ppm != null) return o.ppm > 0
  const texto = (o.valorTexto ?? '').trim().toLowerCase()
  // «<1» (ALS) es un límite: el laboratorio no encontró nada por sobre él.
  return !TEXTOS_NO_DETECTADO.has(texto) && !texto.startsWith('<')
}

/** Códigos de ALS que la ingesta y el catálogo de Toma de muestras escriben distinto (espejo de mapeo.ALIAS_CODIGO_CATALOGO). */
const CODIGOS_EQUIVALENTES: Record<string, string[]> = {
  ECOLI: ['ECOLI100'], COLT: ['COLIF100'], HONG: ['HONGOS'], COLA: ['COLIFG'],
  ECOLA: ['ECOLIG'], ENTB: ['ENTERO'], CEN: ['CENIZAS'], AFLA: ['AFLAT'],
}

/**
 * Los informes de UN laboratorio tabular (ALS o Diagnofruit) con la forma que usan la tabla y los gráficos: un informe
 * por solicitud y, dentro, un resultado por analito con su nombre, unidad y orden. Ignora las filas de otros
 * laboratorios y las solicitudes que aún no tienen resultados.
 *
 * El nombre, la unidad y el orden salen de la tabla fija de cada laboratorio (no dependen de que el catálogo esté
 * sembrado) y, si el analito no está en ella, del catálogo; si tampoco, se muestra el código tal cual llegó.
 */
export function construirInformes(filas: Observacion[], lab: LaboratorioTabular, catalogo: Analito[]): InformeVista[] {
  const porSolicitud = new Map<number, InformeVista>()
  filas.forEach((o) => {
    if (!o.ingrediente || laboratorioBase(o.laboratorio) !== lab) return
    let informe = porSolicitud.get(o.solicitudId)
    if (!informe) {
      informe = {
        solicitudId: o.solicitudId,
        nro: o.nroSolicitud,
        fecha: o.fecha ? o.fecha.slice(0, 10) : null,
        detalle: o.posicionMuestreo,
        cliente: o.cliente,
        planta: o.planta,
        especie: o.crop,
        variedad: o.variedad,
        resultados: [],
      }
      porSolicitud.set(o.solicitudId, informe)
    }
    const delCatalogo = catalogo.find(
      (a) =>
        laboratorioBase(a.laboratorio) === lab &&
        (a.codigo === o.ingrediente || (a.codigo && CODIGOS_EQUIVALENTES[o.ingrediente ?? '']?.includes(a.codigo))),
    )
    const fijo = lab === 'als' ? analitoAls(o.ingrediente) : analitoDiagnofruit(o.ingrediente)
    informe.resultados.push({
      codigo: o.ingrediente,
      nombre: fijo?.nombre ?? delCatalogo?.nombre ?? o.ingrediente,
      unidad: fijo?.unidad ?? delCatalogo?.unidad ?? '',
      orden: fijo?.orden ?? ORDEN_ALS_DESCONOCIDO,
      texto: o.ppm != null ? textoNumero(o.ppm) : (o.valorTexto ?? '—'),
      valor: o.ppm ?? valorDeTexto(o.valorTexto),
      detectado: esDetectado(o),
    })
  })
  const informes = [...porSolicitud.values()]
  // Dentro de un informe los analitos van siempre en el mismo orden.
  informes.forEach((i) => i.resultados.sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es')))
  return informes.sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? ''))
}
