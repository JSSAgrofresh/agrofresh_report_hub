export {
  analizarInformes,
  desbloquearEdicion,
  eliminarRegistroEnvio,
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
  AnalisisLote,
  DatosCorreo,
  LecturaInforme,
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
export { datosCorreo, enviable, etiquetaServicio, motivoBloqueo, nuevoInforme, sinRepetidos } from './lib/informe'
export type { EstadoInforme, Informe } from './lib/informe'
