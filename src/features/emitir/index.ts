export {
  parsearGCCompleto,
  descargarDetalleGCExcel,
  listarSolicitudes,
  descargarExcelCruce,
  descargarInformesPDF,
  obtenerConfiguracionInforme,
  guardarConfiguracionInforme,
  subirCruceABaseDeDatos,
  cruzarConMuestra,
} from './lib/api'
export {
  buscarPorCodigoVial,
  buscarPorFolio,
  filtrarPorFolio,
  normalizarFolio,
} from './lib/folio'
export type { CampoCabeceraGC, CategoriaGC, DetalleGC, MuestraGCDetalle, MuestraGC, RegionGC, ResultadoAnalito, Solicitud, FilaCruce, InformeConfig, FilaSubida } from './lib/tipos'
