export {
  archivoABase64,
  cacheCostoKilo,
  descargarExcelCostoKilo,
  descargarPdfCostoKilo,
  eliminarCostoKilo,
  guardarCostoKilo,
  listarCostoKilo,
  previsualizarCostoKilo,
  verCostoKilo,
} from './lib/api'
export type {
  DetalleCostoKilo,
  DiaCostoKilo,
  ModoCostoKilo,
  PrevisualizacionCostoKilo,
  ResumenCostoKilo,
  ResumenDiarioCostoKilo,
} from './lib/api'
export { COLOR_KG, COLOR_LAMINA, COLOR_MANT, COLOR_TOTAL, activosConConsumo, colorDeActivo, etiquetaDia, fmt, nombreDeActivo, seriesDeDias } from './lib/graficos'
export type { SerieDia } from './lib/graficos'
export { useInformesCostoKilo } from './hooks/useInformesCostoKilo'
