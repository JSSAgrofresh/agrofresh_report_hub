export {
  analizarInformes,
  desbloquearEdicion,
  eliminarRegistroEnvio,
  obtenerEstadoEnvio,
  PLANTILLA_PREDETERMINADA,
  cambiarModoEnvio,
  guardarInternos,
  guardarEncabezado,
  obtenerPlanDestinatarios,
  obtenerTemplateInforme,
  guardarTemplateInforme,
  vistaPreviaInforme,
  enviarInforme,
  historialEnvios,
  obtenerAvisoClientes,
  enviarPruebaAviso,
} from './lib/api'
export type { AvisoClientes } from './lib/api'
export { esCorreoValido, quitarCorreo, separarCorreos, sumarCorreos, tamanoLegible } from './lib/correos'
export type {
  AnalisisLote,
  DatosCorreo,
  Encabezado,
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
