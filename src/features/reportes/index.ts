export {
  obtenerDatosReporte,
  obtenerResumenReporte,
  obtenerClientesReporte,
  listarAnalitos,
  crearAnalito,
  actualizarAnalito,
  eliminarAnalito,
  listarLimites,
  guardarLimite,
  eliminarLimite,
} from './lib/api'
export type { FilaReporte, Analito, AnalitoInput, Observacion, LimiteAnalito, LimiteAnalitoInput } from './lib/tipos'
export {
  calcularEstadisticas,
  calcularLimitesControl,
  calcularCumplimiento,
  contarFueraDeIntervalo,
} from './lib/estadisticas'
export type { Estadisticas, Limites, Cumplimiento } from './lib/estadisticas'
export { proximaHoraProgramada, useActualizacionProgramada, HORAS_PROGRAMADAS } from './lib/programacion'
export { colorDeIngrediente } from './lib/colores'
