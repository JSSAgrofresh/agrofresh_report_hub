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
  cruzarCompleto,
  listarActividadLab,
  urlFotoCruce,
} from './lib/api'
export {
  buscarPorCodigoVial,
  buscarPorFolio,
  filtrarPorFolio,
  normalizarFolio,
} from './lib/folio'
export type {
  CampoCabeceraGC, CategoriaGC, DetalleGC, MuestraGCDetalle, MuestraGC,
  RegionGC, ResultadoAnalito, Solicitud, FilaCruce, InformeConfig, FilaSubida,
  ActividadLab, TipoMuestra, ConfigTipoMuestra,
} from './lib/tipos'
export { CONFIG_TIPOS_MUESTRA } from './lib/tipos'
