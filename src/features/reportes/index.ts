export {
  obtenerDatosReporte,
  descargarDatosExcel,
  descargarBdExcel,
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
export { colorCategorico, colorDeIngrediente } from './lib/colores'
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
export { generarDatosSimulados } from './lib/simulacion'
export type { DatosSimulados } from './lib/simulacion'
export { lunesDe, solicitudesPor, MAX_PUNTOS_DIARIOS } from './lib/agrupacion'
export { tituloGrafico, informesConPuntos, colorEspecieMarca } from './lib/graficoResiduales'
export { tramosSuaves, trazarCurvaSuave } from './lib/curvaSuave'
export type { InformeConPuntos } from './lib/graficoResiduales'
export { describirFiltros, pedidoBd } from './lib/descargaBd'
export type { PedidoBd } from './lib/descargaBd'
