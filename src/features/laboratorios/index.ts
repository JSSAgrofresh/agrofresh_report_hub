export {
  resumenLaboratorios,
  listarUnidades,
  crearUnidad,
  actualizarUnidad,
  eliminarUnidad,
  listarContactos,
  crearContacto,
  actualizarContacto,
  eliminarContacto,
  listarAnalisis,
  crearAnalisis,
  actualizarAnalisis,
  eliminarAnalisis,
  obtenerTemplateMail,
  guardarTemplateMail,
} from './lib/api'

export { MODOS_ANALISIS, TIPOS_CONTACTO, TIPOS_COPIA } from './lib/tipos'

export type {
  Analisis,
  AnalisisInput,
  AnalitoDeAnalisis,
  Contacto,
  ContactoInput,
  ModoAnalisis,
  ResumenLaboratorio,
  TipoContacto,
  TipoCopia,
  Unidad,
  UnidadInput,
  TemplateMail,
  TemplateMailInput,
} from './lib/tipos'
