import { FILTROS_VACIOS, claveFiltrosGuardados, guardarFiltros } from '@/features/tomaMuestras/lib/filtrosSolicitudes'
import type { FiltrosSolicitudes } from '@/features/tomaMuestras/lib/filtrosSolicitudes'

/** Los filtros de «Solicitudes e informes» (Toma de muestras) que dejan solo las
 * solicitudes que siguen sin informe, de un laboratorio o de todos. */
export function filtrosPendientesDeInforme(laboratorio?: string | null): FiltrosSolicitudes {
  return {
    ...FILTROS_VACIOS,
    laboratorio: laboratorio ? [laboratorio] : [],
    estado: ['sin_informe'],
  }
}

/** Deja esos filtros guardados para la cuenta: Solicitudes e informes los lee al
 * abrirse (igual que si la persona los hubiera marcado). Sin almacenamiento
 * (modo privado) simplemente no se aplican. */
export function dejarFiltrosPendientes(
  email: string | null | undefined,
  laboratorio?: string | null,
  almacen: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = localStorage,
  ahora: number = Date.now(),
): void {
  try {
    guardarFiltros(almacen, claveFiltrosGuardados(email), filtrosPendientesDeInforme(laboratorio), ahora)
  } catch {
    /* sin almacenamiento */
  }
}
