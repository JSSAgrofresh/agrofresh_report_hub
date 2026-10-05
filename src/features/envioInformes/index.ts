export {
  obtenerEstadoEnvio,
  cambiarModoEnvio,
  guardarInternos,
  obtenerPlanDestinatarios,
  obtenerTemplateInforme,
  guardarTemplateInforme,
  vistaPreviaInforme,
  enviarInforme,
  historialEnvios,
} from './lib/api'
export { esCorreoValido, quitarCorreo, separarCorreos, sumarCorreos, tamanoLegible } from './lib/correos'
export type {
  DatosCorreo,
  EstadoEnvio,
  Historial,
  Internos,
  ModoEnvio,
  PlanDestinatarios,
  RegistroEnvio,
  Reparto,
  ResultadoEnvio,
  VistaPrevia,
} from './lib/tipos'
