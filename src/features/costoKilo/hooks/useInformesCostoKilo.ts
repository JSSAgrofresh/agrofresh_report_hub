import { useCallback, useEffect, useState } from 'react'
import { cacheCostoKilo, listarCostoKilo } from '../lib/api'
import type { ModoCostoKilo, ResumenCostoKilo } from '../lib/api'

/**
 * Los informes de costo por kilo de la cuenta. Lo de la vez anterior se dibuja de inmediato y se actualiza por detrás.
 * Si no se pueden leer (la cuenta no tiene acceso, el servidor no los conoce todavía) queda en lista vacía: la sección
 * simplemente no aparece, nunca rompe el reporte de Accu-Tab.
 */
export function useInformesCostoKilo(modo: ModoCostoKilo, activo = true) {
  const [informes, setInformes] = useState<ResumenCostoKilo[]>(() => cacheCostoKilo.leer(modo) ?? [])

  const recargar = useCallback(async () => {
    try {
      const lista = await listarCostoKilo(modo)
      cacheCostoKilo.guardar(modo, lista)
      setInformes(lista)
    } catch {
      /* sin informes: la sección no se muestra */
    }
  }, [modo])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (activo) void recargar()
  }, [activo, recargar])

  return { informes: activo ? informes : [], recargar }
}
