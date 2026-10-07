export {
  analizarInformes,
  desbloquearEdicion,
  eliminarRegistroEnvio,
  obtenerEstadoEnvio,
  PLANTILLA_PREDETERMINADA,
  cambiarModoEnvio,
  guardarInternos,
  guardarEncabezado,
  guardarDestinatariosPrueba,
  obtenerPlanDestinatarios,
  obtenerTemplateInforme,
  guardarTemplateInforme,
  vistaPreviaInforme,
  enviarInforme,
  historialEnvios,
  obtenerAvisoClientes,
  vistaPreviaAviso,
  guardarAviso,
  restaurarAviso,
  enviarPruebaAviso,
} from './lib/api'
export type { AvisoClientes, DatosAviso, PlantillaAviso } from './lib/api'
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
