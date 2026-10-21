import { ROUTES } from '@/constants/routes'
import { modulosPermitidos, puedeVerReporte, vistaDeCliente } from '@/features/usuarios'
import type { Usuario } from '@/features/usuarios'

function esDePortal(u: Pick<Usuario, 'tipoAcceso'>): boolean {
  return u.tipoAcceso === 'cliente' || u.tipoAcceso === 'comercial'
}

/** Dónde aterriza una cuenta de cliente o comercial: lo primero que ve son los gráficos del Report, y si no tiene
 * Report, su Storage. `null` = se queda en el Panel general (por ejemplo, solo informes Accu-Tab). */
export function rutaDeInicioPortal(u: Usuario): string | null {
  if (!esDePortal(u)) return null
  if (puedeVerReporte(u, 'laboratorio')) return ROUTES.reportsLaboratorio
  if (modulosPermitidos(u).some((m) => m.id === 'storage')) return ROUTES.storage
  return null
}

/** El Panel general queda fuera del menú de la burbuja mientras la cuenta tenga adónde aterrizar, salvo que sus
 * informes Accu-Tab vivan solo ahí. */
export function ocultaPanelGeneral(u: Usuario): boolean {
  return esDePortal(u) && rutaDeInicioPortal(u) !== null && !vistaDeCliente(u).accutab
}
