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
export type GrupoWidget = 'Títulos por área' | 'Destacados' | 'Gráficos' | 'Módulos' | 'Indicadores' | 'Paneles de actividad' | 'Portal de cliente'

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

const titulos: WidgetDef[] = [
  { id: 'titulo:general', nombre: 'Título · General', descripcion: 'Separador con título para ordenar el panel por secciones.' },
  ...(['cromatografia', 'postventa', 'ryd', 'toma_muestras'] as AreaId[]).map((a) => ({
    id: `titulo:${a}`,
    nombre: `Título · ${AREAS[a].nombre}`,
    descripcion: `Separador con el color de ${AREAS[a].nombre}: agrupa debajo lo que es de esa área.`,
  })),
].map((t) => ({ ...t, grupo: 'Títulos por área' as const, audiencia: 'interno' as const, w: 12, h: 1, minW: 3, minH: 1 }))

const visuales: WidgetDef[] = [
  { id: 'hero:bienvenida', nombre: 'Bienvenida', descripcion: 'Saludo con la fecha y lo pendiente de hoy.', grupo: 'Destacados', audiencia: 'interno', w: 12, h: 3, minW: 4, minH: 2 },
  { id: 'carrusel:novedades', nombre: 'Carrusel de novedades', descripcion: 'Pasa solo por solicitudes, Converter, verificación y Post Venta (se detiene al pasar el mouse).', grupo: 'Destacados', audiencia: 'interno', w: 4, h: 4, minW: 3, minH: 3 },
  { id: 'grafico:actividad', nombre: 'Solicitudes por día', descripcion: 'Curva de los últimos 30 días; al pasar el mouse muestra cada día.', grupo: 'Gráficos', audiencia: 'interno', w: 8, h: 4, minW: 4, minH: 3 },
  { id: 'grafico:laboratorios', nombre: 'Por laboratorio', descripcion: 'Barras con las solicitudes de los últimos 90 días por laboratorio.', grupo: 'Gráficos', audiencia: 'interno', w: 4, h: 4, minW: 3, minH: 3 },
  { id: 'grafico:especies', nombre: 'Por especie', descripcion: 'Dona con la mezcla de especies de los últimos 90 días.', grupo: 'Gráficos', audiencia: 'interno', w: 4, h: 4, minW: 3, minH: 3 },
  { id: 'grafico:verificaciones', nombre: 'Verificaciones del mes', descripcion: 'Un cuadro por día: aceptable, no aceptable o sin registro.', grupo: 'Gráficos', audiencia: 'interno', w: 4, h: 3, minW: 3, minH: 3 },
]

export const WIDGETS: WidgetDef[] = [
  ...visuales,
  ...titulos,
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
