import type { ConfigEnvioAutomatico } from './tipos'

/** ¿Esta solicitud se envía sola al guardar? Manda la regla de su tipo de
 * aplicación; sin regla propia (o sin tipo elegido) rige la general. */
export function enviaSoloSegunTipo(cfg: ConfigEnvioAutomatico, tipo: string): boolean {
  const propia = tipo ? cfg.por_tipo?.[tipo] : undefined
  return propia ?? cfg.activo
}

/** ¿Se puede editar esta solicitud ya guardada? El administrador general siempre; el resto, con la función `toma_editar`
 * y solo si su tipo de aplicación NO se envía solo (editarla la reenviaría de inmediato). Una de prueba nunca se envía
 * sola. Espejo de `_exigir_puede_editar` (backend). */
export function puedeEditarSegunEnvio(
  usuario: { tipoAcceso: string; modulos?: string[] },
  cfg: ConfigEnvioAutomatico,
  tipo: string,
  esPrueba: boolean,
): boolean {
  if (usuario.tipoAcceso === 'admin_general') return true
  if (usuario.tipoAcceso === 'gerencia' || usuario.tipoAcceso === 'cliente' || usuario.tipoAcceso === 'comercial') return false
  if (!(usuario.modulos ?? []).includes('toma_editar')) return false
  return esPrueba || !enviaSoloSegunTipo(cfg, tipo)
}
