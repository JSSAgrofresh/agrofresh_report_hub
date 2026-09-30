import type { ConfigEnvioAutomatico } from './tipos'

/** ¿Esta solicitud se envía sola al guardar? Manda la regla de su tipo de
 * aplicación; sin regla propia (o sin tipo elegido) rige la general. */
export function enviaSoloSegunTipo(cfg: ConfigEnvioAutomatico, tipo: string): boolean {
  const propia = tipo ? cfg.por_tipo?.[tipo] : undefined
  return propia ?? cfg.activo
}
