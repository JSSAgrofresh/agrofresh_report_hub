export const ROUTES = {
  login: '/login',
  dashboard: '/',
  ingesta: '/modulos/ingesta',
  datacore: '/modulos/datacore',
  trace: '/modulos/trace',
  converter: '/modulos/convertidor',
  ingest: '/modulos/ingest',
  reports: '/modulos/reportes',
  reportsLaboratorio: '/modulos/reportes/laboratorio',
  reportsPostVenta: '/modulos/reportes/post-venta',
  agrofreshLab: '/modulos/agrofresh-lab',
  agrofreshLabIngreso: '/modulos/agrofresh-lab/ingreso',
  agrofreshLabVerificaciones: '/modulos/agrofresh-lab/verificaciones',
  agrofreshLabVerificacionesHistorico: '/modulos/agrofresh-lab/verificaciones/historico',
  agrofreshLabVerificacionesCriterios: '/modulos/agrofresh-lab/verificaciones/criterios',
  storage: '/modulos/storage',
  tomaMuestras: '/modulos/toma-muestras',
  tomaMuestrasNueva: '/modulos/toma-muestras/nueva',
  tomaMuestrasConfig: '/modulos/toma-muestras/configuracion',
  tomaMuestrasDetalle: '/modulos/toma-muestras/detalle/:archivo',
  tomaMuestrasEditar: '/modulos/toma-muestras/editar/:archivo',
  tomaMuestrasNuevaReanalisis: '/modulos/toma-muestras/reanalisis/nueva',
  tomaMuestrasReanalisis: '/modulos/toma-muestras/reanalisis/:archivo',
  adminUsuarios: '/admin/usuarios',
  adminListados: '/admin/listados',
  adminLaboratorios: '/admin/laboratorios',
  adminNotificaciones: '/admin/notificaciones',
} as const

export function rutaTomaMuestrasDetalle(archivo: string): string {
  return `/modulos/toma-muestras/detalle/${encodeURIComponent(archivo)}`
}

export function rutaTomaMuestrasEditar(archivo: string): string {
  return `/modulos/toma-muestras/editar/${encodeURIComponent(archivo)}`
}

export function rutaTomaMuestrasReanalisis(archivo: string): string {
  return `/modulos/toma-muestras/reanalisis/${encodeURIComponent(archivo)}`
}
