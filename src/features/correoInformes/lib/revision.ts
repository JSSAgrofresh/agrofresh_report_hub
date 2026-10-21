import type { DestinatariosCorreo, EstadoInforme, Hallazgo, InformeCorreo } from './api'

export const ETIQUETA_ESTADO: Record<EstadoInforme, string> = {
  ok: 'Listo',
  amarillo: 'Revisar',
  rojo: 'Seguimiento',
}

/** Lo que el informe dice de sí mismo para una sola línea: «Quiteca · 2026-1914-PC · OT-QUI0053». */
export function resumenInforme(i: Pick<InformeCorreo, 'laboratorio' | 'nro_informe' | 'ot'>): string {
  return [i.laboratorio, i.nro_informe, i.ot].filter(Boolean).join(' · ') || 'Sin identificar'
}

/** El hallazgo más grave de un informe (el que se muestra en la fila). */
export function hallazgoPrincipal(hallazgos: Hallazgo[]): Hallazgo | null {
  const peso = { rojo: 2, amarillo: 1, info: 0 } as const
  return [...hallazgos].sort((a, b) => peso[b.nivel] - peso[a.nivel])[0] ?? null
}

export interface FilaDestinatario {
  correo: string
  /** `esperado`: la solicitud lo pide y llegó · `falta`: la solicitud lo pide y no llegó · `demas`: llegó y no estaba. */
  tipo: 'esperado' | 'falta' | 'demas'
  /** Un correo de AgroFresh que sobra es solo para revisar; uno de afuera es un posible envío equivocado. */
  interno: boolean
}

export function esCorreoInterno(correo: string): boolean {
  return correo.toLowerCase().endsWith('@agrofresh.com')
}

/**
 * Esperado contra real, persona por persona. Se mira solo Para y Copia (lo que un correo recibido
 * muestra), igual que el servidor; quien está en Para o en Copia cuenta como presente.
 */
export function compararDestinatarios(
  esperado: Partial<DestinatariosCorreo>,
  real: { para: string[]; cc: string[]; bcc: string[] },
  propios: string[] = [],
): FilaDestinatario[] {
  const minus = (l: string[] | undefined) => (l ?? []).map((c) => c.toLowerCase())
  const piden = [...new Set([...minus(esperado.to), ...minus(esperado.cc)])]
  const permitidos = new Set([...piden, ...minus(esperado.bcc), ...minus(propios)])
  const llegaron = [...new Set([...minus(real.para), ...minus(real.cc), ...minus(real.bcc)])]
  const filas: FilaDestinatario[] = []
  for (const c of piden) filas.push({ correo: c, tipo: llegaron.includes(c) ? 'esperado' : 'falta', interno: esCorreoInterno(c) })
  for (const c of llegaron) if (!permitidos.has(c)) filas.push({ correo: c, tipo: 'demas', interno: esCorreoInterno(c) })
  return filas
}
