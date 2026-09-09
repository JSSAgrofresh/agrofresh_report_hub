import { HttpError } from '@/services/http/client'

/**
 * Por qué no cargó el módulo, dicho de forma que se pueda actuar.
 *
 * Este módulo llegó a producción antes que el backend: el frontend se
 * despliega solo al pushear (Vercel) y el backend vive en el servidor de la
 * oficina, que hay que actualizar y reiniciar a mano. Así que la primera vez
 * la pantalla pidió `/verificaciones/config` a un backend que todavía no
 * conocía esa ruta, y el aviso genérico decía "¿está el backend arriba?"
 * cuando el backend estaba perfectamente arriba.
 *
 * Los tres casos se distinguen por el código, y cada uno tiene un arreglo
 * distinto:
 *
 *   404  el backend corriendo no tiene el módulo -> actualizar y REINICIAR.
 *   500  el módulo está, pero las tablas no      -> correr la migración 0026.
 *   otro no hay backend al otro lado             -> levantarlo.
 */
export function explicarErrorDeConfig(error: unknown): string {
  if (error instanceof HttpError && error.status === 404) {
    return (
      'El backend que está corriendo todavía no conoce este módulo. En el servidor: ' +
      'git pull, correr la migración 0026_verificaciones_diarias.sql y reiniciar el backend ' +
      '(actualizar el código no basta: el proceso hay que reiniciarlo).'
    )
  }
  if (error instanceof HttpError && error.status >= 500) {
    return (
      'El backend tiene el módulo pero no puede leer sus tablas. Falta correr la migración ' +
      'en el servidor: scripts\\migrar.py 0026_verificaciones_diarias.sql'
    )
  }
  return 'No se pudo conectar con el backend. Revisa que esté corriendo.'
}
