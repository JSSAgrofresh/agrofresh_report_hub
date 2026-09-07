import { ROUTES } from './routes'

export type EstadoModulo = 'disponible' | 'en_preparacion' | 'proximamente'

export interface ModuloInfo {
  id: string
  nombre: string
  descripcion: string
  ruta: string
  estado: EstadoModulo
  /** Módulos con el mismo `grupo` se muestran anidados bajo un encabezado
   * común en el menú (ver Sidebar.tsx) — es solo agrupación visual, los ids,
   * rutas y permisos de cada uno no cambian. */
  grupo?: string
}

/** id del grupo "Data Core" -Cargar Datos, Trace, Converter y Auditoría son,
 * conceptualmente, las cuatro herramientas de preparación y homogenización de
 * datos del sistema (ver PROJECT_CONTEXT.md): se muestran juntas en el menú
 * aunque cada una siga siendo su propia ruta y su propio permiso, exactamente
 * como antes. */
export const GRUPO_DATACORE = 'datacore'

export const MODULOS: ModuloInfo[] = [
  {
    id: 'ingest',
    nombre: 'Cargar Datos',
    descripcion: 'Carga guiada de resultados de laboratorio: validar, homogeneizar y subir a la base de datos.',
    ruta: ROUTES.ingest,
    estado: 'disponible',
    grupo: GRUPO_DATACORE,
  },
  {
    id: 'trace',
    nombre: 'Trace',
    descripcion: 'Trazabilidad de registros pH/ORP de equipos Accu-Tab e informes PDF.',
    ruta: ROUTES.trace,
    estado: 'disponible',
    grupo: GRUPO_DATACORE,
  },
  {
    id: 'converter',
    nombre: 'Converter',
    descripcion: 'Conversión y homogenización de informes de laboratorio contra el catálogo oficial.',
    ruta: ROUTES.converter,
    estado: 'disponible',
    grupo: GRUPO_DATACORE,
  },
  {
    id: 'datacore',
    nombre: 'Auditoría y modelo',
    descripcion: 'Modelo entidad-relación, exploración por tabla y auditoría de homogenización de la base de datos.',
    ruta: ROUTES.datacore,
    estado: 'disponible',
    grupo: GRUPO_DATACORE,
  },
  {
    id: 'reports',
    nombre: 'Report',
    descripcion: 'Control de residuos: límites residuales y de control en tiempo real desde la base de datos.',
    ruta: ROUTES.reports,
    estado: 'disponible',
  },
  {
    id: 'agrofresh_lab',
    nombre: 'AgroFresh Lab',
    descripcion: 'Ingreso de muestras al laboratorio, cruce con el resultado del GC y emisión de informes.',
    ruta: ROUTES.agrofreshLab,
    estado: 'disponible',
  },
  {
    id: 'storage',
    nombre: 'Storage',
    descripcion: 'Archivos guardados en el servidor: arrastra y suelta para subirlos.',
    ruta: ROUTES.storage,
    estado: 'disponible',
  },
]
