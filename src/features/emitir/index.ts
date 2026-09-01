export {
  parsearGC,
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
export type { MuestraGC, ResultadoAnalito, Solicitud, FilaCruce, InformeConfig, FilaSubida } from './lib/tipos'
