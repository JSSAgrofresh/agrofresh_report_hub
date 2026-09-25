export {
  obtenerDatosReporte,
  descargarDatosExcel,
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
  histograma,
} from './lib/estadisticas'
export type { Estadisticas, Limites, Cumplimiento, TramoHistograma } from './lib/estadisticas'
export { proximaHoraProgramada, useActualizacionProgramada, HORAS_PROGRAMADAS } from './lib/programacion'
export { colorDeIngrediente } from './lib/colores'
export {
  FILTROS_VACIOS,
  aplicarFiltros,
  claveFiltro,
  clientesDeSucursal,
  contarFiltrosActivos,
  mismoValor,
  opcionesDe,
} from './lib/filtros'
export type { FiltrosReporte, OpcionFiltro, CampoTexto } from './lib/filtros'
