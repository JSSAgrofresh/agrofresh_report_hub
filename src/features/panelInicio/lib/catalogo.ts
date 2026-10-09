import { MODULOS } from '@/constants/modules'
import type { AreaId } from '@/constants/areas'
import { AREAS } from '@/constants/areas'

/**
 * Los widgets que se pueden poner en el Panel general. El `id` es lo que se guarda (y lo que valida el
 * backend en `app/panel_inicio.py`: solo letras y «_», con un prefijo `grupo:nombre`).
 *
 * `audiencia`: quién puede verlo. Los `cliente:*` son los únicos que ve una cuenta de cliente; el servidor
 * además filtra, así que aunque alguien guardara otra cosa, un cliente no la recibiría.
 * `w` y `h` son el tamaño al arrastrarlo a la grilla (unidades de 12 columnas); `minW`/`minH` el mínimo al achicarlo.
 */
export type Audiencia = 'interno' | 'cliente'
export type GrupoWidget = 'Módulos' | 'Indicadores' | 'Paneles de actividad' | 'Portal de cliente'

export interface WidgetDef {
  id: string
  nombre: string
  descripcion: string
  grupo: GrupoWidget
  audiencia: Audiencia
  w: number
  h: number
  minW: number
  minH: number
  /** Para los widgets de módulo: el módulo que abre. */
  moduloId?: string
  /** Para los de cliente: en qué área tiene sentido. Sin valor = en todas. */
  area?: AreaId
}

const modulos: WidgetDef[] = MODULOS.map((m) => ({
  id: `modulo:${m.id}`,
  nombre: m.nombre,
  descripcion: `Tarjeta que abre «${m.nombre}». Solo se muestra a quien tenga ese módulo.`,
  grupo: 'Módulos',
  audiencia: 'interno',
  w: 3,
  h: 3,
  minW: 2,
  minH: 2,
  moduloId: m.id,
}))

export const WIDGETS: WidgetDef[] = [
  ...modulos,
  { id: 'kpi:solicitudes', nombre: 'Solicitudes en la base', descripcion: 'Cuántos registros vigentes hay.', grupo: 'Indicadores', audiencia: 'interno', w: 3, h: 2, minW: 2, minH: 2 },
  { id: 'kpi:semana', nombre: 'Ingresadas esta semana', descripcion: 'Solicitudes de los últimos 7 días.', grupo: 'Indicadores', audiencia: 'interno', w: 3, h: 2, minW: 2, minH: 2 },
  { id: 'kpi:converter', nombre: 'En cola Converter', descripcion: 'Filas esperando revisión.', grupo: 'Indicadores', audiencia: 'interno', w: 3, h: 2, minW: 2, minH: 2 },
  { id: 'kpi:verificacion', nombre: 'Verificación de hoy', descripcion: 'Si ya se registró la verificación diaria.', grupo: 'Indicadores', audiencia: 'interno', w: 3, h: 2, minW: 2, minH: 2 },
  { id: 'panel:usuarios_activos', nombre: 'Usuarios activos', descripcion: 'Quién usó el sistema en la última hora.', grupo: 'Paneles de actividad', audiencia: 'interno', w: 4, h: 5, minW: 3, minH: 3 },
  { id: 'panel:converter', nombre: 'Últimas cargas de Converter', descripcion: 'Las cargas más recientes.', grupo: 'Paneles de actividad', audiencia: 'interno', w: 4, h: 5, minW: 3, minH: 3 },
  { id: 'panel:trace', nombre: 'Últimas lecturas pH/ORP', descripcion: 'Lecturas Accu-Tab recientes.', grupo: 'Paneles de actividad', audiencia: 'interno', w: 4, h: 5, minW: 3, minH: 3 },
  { id: 'panel:solicitudes', nombre: 'Últimas solicitudes', descripcion: 'Las solicitudes más recientes.', grupo: 'Paneles de actividad', audiencia: 'interno', w: 6, h: 5, minW: 4, minH: 3 },
  { id: 'panel:verificaciones', nombre: 'Verificaciones diarias', descripcion: 'El estado de las últimas verificaciones.', grupo: 'Paneles de actividad', audiencia: 'interno', w: 6, h: 5, minW: 4, minH: 3 },
  { id: 'cliente:encabezado', nombre: 'Encabezado con foto', descripcion: 'El nombre del cliente sobre la foto de la fruta.', grupo: 'Portal de cliente', audiencia: 'cliente', w: 12, h: 3, minW: 6, minH: 2 },
  { id: 'cliente:reporte', nombre: 'Reporte de residuos', descripcion: 'Resultados, gráficos y descargas de SUS muestras.', grupo: 'Portal de cliente', audiencia: 'cliente', w: 12, h: 12, minW: 8, minH: 6, area: 'cromatografia' },
  { id: 'cliente:accutab', nombre: 'Informes Accu-Tab', descripcion: 'Los informes de sus equipos, con descarga.', grupo: 'Portal de cliente', audiencia: 'cliente', w: 12, h: 8, minW: 6, minH: 4, area: 'postventa' },
]

export const widgetPorId = (id: string): WidgetDef | undefined => WIDGETS.find((w) => w.id === id)

// ── A quién se le arma el panel ──────────────────────────────────────────

export interface Objetivo {
  /** La clave que se guarda (ver `panel_inicio.py`). */
  clave: string
  etiqueta: string
  audiencia: Audiencia
  /** Para filtrar widgets de cliente por área. */
  area?: AreaId
}

export const OBJETIVOS_POR_TIPO: Objetivo[] = [
  { clave: 'tipo:admin_general', etiqueta: 'Administrador general', audiencia: 'interno' },
  { clave: 'tipo:gerencia', etiqueta: 'Gerencia', audiencia: 'interno' },
  ...(['cromatografia', 'postventa', 'ryd', 'toma_muestras'] as AreaId[]).map((a) => ({
    clave: `tipo:admin_area:${a}`,
    etiqueta: `Admin · ${AREAS[a].nombre}`,
    audiencia: 'interno' as const,
  })),
  { clave: 'tipo:analista', etiqueta: 'Analistas', audiencia: 'interno' },
  { clave: 'tipo:muestreador', etiqueta: 'Muestreadores', audiencia: 'interno' },
  { clave: 'tipo:cliente', etiqueta: 'Todos los clientes', audiencia: 'cliente' },
  { clave: 'tipo:cliente:cromatografia', etiqueta: 'Clientes · Cromatografía', audiencia: 'cliente', area: 'cromatografia' },
  { clave: 'tipo:cliente:postventa', etiqueta: 'Clientes · Post Venta', audiencia: 'cliente', area: 'postventa' },
]

export const claveDeCuenta = (id: string): string => `usuario:${id}`

/** Los widgets que se ofrecen para un objetivo: los de clientes solo a clientes, los internos solo a internos. */
export function widgetsParaObjetivo(o: Pick<Objetivo, 'audiencia' | 'area'>): WidgetDef[] {
  return WIDGETS.filter((w) => w.audiencia === o.audiencia && (!w.area || !o.area || w.area === o.area))
}
