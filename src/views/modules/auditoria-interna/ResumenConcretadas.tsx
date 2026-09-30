import { ResumenHero } from '@/components/ui/ResumenHero'
import type { Totales } from '@/features/auditoriaInterna'
import { ESTADOS, ORDEN_ESTADOS } from './estados'

const nf = new Intl.NumberFormat('es-CL')

/** La cifra grande de Auditoría interna: qué parte de lo emitido ya se concretó
 * y cómo se reparte entre los tres estados. */
export function ResumenConcretadas({ totales: t }: { totales: Totales }) {
  const n = { concretada: t.concretadas, sin_report: t.sinReport, pendiente: t.pendientes }
  return (
    <ResumenHero
      etiqueta="Solicitudes concretadas"
      porcentaje={t.porcentajeConcretado}
      cifra={t.concretadas}
      cifraSub={`de ${nf.format(t.emitidas)} emitidas`}
      descripcion="Con su PDF guardado y sus resultados ya en Report."
      ariaLabel="Resumen de solicitudes concretadas"
      segmentos={ORDEN_ESTADOS.map((e) => ({ clave: e, texto: ESTADOS[e].texto, n: n[e], color: ESTADOS[e].color, tinta: ESTADOS[e].tinta, fondo: ESTADOS[e].fondo }))}
    />
  )
}
