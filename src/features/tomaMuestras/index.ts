export { listarSolicitudes, obtenerSolicitud, crearSolicitud, eliminarSolicitud } from './lib/api'
export {
  listarCamposConfig,
  guardarCamposConfig,
  listarTiposAplicacion,
  crearTipoAplicacion,
  actualizarTipoAplicacion,
  eliminarTipoAplicacion,
  listarLineasProceso,
  crearLineaProceso,
  actualizarLineaProceso,
  eliminarLineaProceso,
  listarAnalitosConfig,
  crearAnalitoConfig,
  actualizarAnalitoConfig,
  eliminarAnalitoConfig,
} from './lib/api'
export type {
  Solicitud,
  SolicitudInput,
  Laboratorio,
  CampoConfig,
  OpcionConfig,
  OpcionInput,
  AnalitoConfig,
  AnalitoInput,
} from './lib/tipos'
export { LABORATORIOS } from './lib/tipos'
