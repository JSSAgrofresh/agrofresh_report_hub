export const ROUTES = {
  login: '/login',
  dashboard: '/',
  datacore: '/modulos/datacore',
  trace: '/modulos/trace',
  converter: '/modulos/convertidor',
  ingest: '/modulos/ingest',
  reports: '/modulos/reportes',
  reportsLaboratorio: '/modulos/reportes/laboratorio',
  reportsPostVenta: '/modulos/reportes/post-venta',
  agrofreshLab: '/modulos/agrofresh-lab',
  storage: '/modulos/storage',
  tomaMuestras: '/modulos/toma-muestras',
  tomaMuestrasNueva: '/modulos/toma-muestras/nueva',
  tomaMuestrasConfig: '/modulos/toma-muestras/configuracion',
  tomaMuestrasDetalle: '/modulos/toma-muestras/detalle/:archivo',
  tomaMuestrasEditar: '/modulos/toma-muestras/editar/:archivo',
  adminUsuarios: '/admin/usuarios',
  adminListados: '/admin/listados',
  adminLaboratorios: '/admin/laboratorios',
} as const

export function rutaTomaMuestrasDetalle(archivo: string): string {
  return `/modulos/toma-muestras/detalle/${encodeURIComponent(archivo)}`
}

export function rutaTomaMuestrasEditar(archivo: string): string {
  return `/modulos/toma-muestras/editar/${encodeURIComponent(archivo)}`
}
