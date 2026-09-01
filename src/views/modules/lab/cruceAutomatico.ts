import type { FilaCruce, MuestraGC, Solicitud } from '@/features/emitir'

export interface CruceAutomatico {
  solicitud: Solicitud
  muestra: MuestraGC | null
  analitosFaltantes: string[]
}

export function normalizarCodigo(codigo: string | null | undefined): string {
  return (codigo ?? '').trim().toUpperCase()
}

export function construirCrucesAutomaticos(
  solicitudes: Solicitud[],
  muestras: MuestraGC[],
): CruceAutomatico[] {
  const porCodigo = new Map(muestras.map((m) => [normalizarCodigo(m.codigo), m]))
  return solicitudes
    .filter((s) => normalizarCodigo(s.codigo_muestra))
    .map((solicitud) => {
      const muestra = porCodigo.get(normalizarCodigo(solicitud.codigo_muestra)) ?? null
      const medidos = new Set(
        (muestra?.resultados ?? []).map((r) => r.codigo).filter((c): c is string => Boolean(c)),
      )
      return {
        solicitud,
        muestra,
        analitosFaltantes: muestra
          ? solicitud.analitos_solicitados.filter((codigo) => !medidos.has(codigo))
          : [],
      }
    })
}

export function construirFilasExportables(
  cruces: CruceAutomatico[],
  fechaRecepcion: string,
): FilaCruce[] {
  return cruces
    .filter((c) => c.muestra && c.analitosFaltantes.length === 0)
    .map(({ solicitud, muestra }) => {
      const resultadosPorCodigo: Record<string, number | null> = {}
      for (const resultado of muestra?.resultados ?? []) {
        if (resultado.codigo) resultadosPorCodigo[resultado.codigo] = resultado.amount
      }
      return {
        campos: solicitud.campos,
        analitos_solicitados: solicitud.analitos_solicitados,
        resultados_por_codigo: resultadosPorCodigo,
        codigo_vial: muestra?.codigo ?? null,
        fecha_inyeccion: muestra?.fecha_inyeccion ?? null,
        fecha_recepcion: fechaRecepcion || null,
      }
    })
}

export function muestrasSinSolicitud(
  solicitudes: Solicitud[],
  muestras: MuestraGC[],
): MuestraGC[] {
  const usados = new Set(
    solicitudes.map((s) => normalizarCodigo(s.codigo_muestra)).filter(Boolean),
  )
  return muestras.filter((m) => !usados.has(normalizarCodigo(m.codigo)))
}
