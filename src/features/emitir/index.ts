export {
  parsearGC,
  parsearGCCompleto,
  descargarDetalleGCExcel,
  listarSolicitudes,
  descargarExcelCruce,
  descargarInformesPDF,
  obtenerConfiguracionInforme,
  guardarConfiguracionInforme,
  subirCruceABaseDeDatos,
} from './lib/api'
export {
  buscarPorCodigoVial,
  buscarPorFolio,
  filtrarPorFolio,
  normalizarFolio,
} from './lib/folio'
export type { MuestraGCDetalle, MuestraGC, ResultadoAnalito, Solicitud, FilaCruce, InformeConfig, FilaSubida } from './lib/tipos'
