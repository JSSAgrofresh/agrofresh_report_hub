export {
  listarBandeja,
  detalleInformeCorreo,
  revisarCorreoAhora,
  pdfInformeCorreo,
} from './lib/api'
export type {
  Bandeja,
  ConteosBandeja,
  DetalleInformeCorreo,
  EstadoInforme,
  FiltroBandeja,
  Hallazgo,
  InformeCorreo,
  NivelHallazgo,
  UltimoSondeo,
} from './lib/api'
export { ETIQUETA_ESTADO, resumenInforme, hallazgoPrincipal, compararDestinatarios, esCorreoInterno } from './lib/revision'
export type { FilaDestinatario } from './lib/revision'
