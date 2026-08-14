import { ROUTES } from './routes'

export type EstadoModulo = 'disponible' | 'en_preparacion' | 'proximamente'

export interface ModuloInfo {
  id: string
  nombre: string
  descripcion: string
  ruta: string
  estado: EstadoModulo
}

export const MODULOS: ModuloInfo[] = [
  {
    id: 'audit',
    nombre: 'Audit',
    descripcion: 'Carga de solicitudes de laboratorio con cola de aprobación manual.',
    ruta: ROUTES.audit,
    estado: 'en_preparacion',
  },
  {
    id: 'trace',
    nombre: 'Trace',
    descripcion: 'Trazabilidad de registros pH/ORP de equipos Accu-Tab e informes PDF.',
    ruta: ROUTES.trace,
    estado: 'disponible',
  },
  {
    id: 'converter',
    nombre: 'Converter',
    descripcion: 'Conversión y homogenización de informes de laboratorio contra el catálogo oficial.',
    ruta: ROUTES.converter,
    estado: 'disponible',
  },
  {
    id: 'ingest',
    nombre: 'Ingest',
    descripcion: 'Homogenización y validación de la base de datos antes de cargarla a producción.',
    ruta: ROUTES.ingest,
    estado: 'disponible',
  },
  {
    id: 'reports',
    nombre: 'Report',
    descripcion: 'Reportes consolidados de la operación.',
    ruta: ROUTES.reports,
    estado: 'proximamente',
  },
]
