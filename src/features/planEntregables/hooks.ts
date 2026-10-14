import { useEffect, useMemo, useState } from 'react'
import { leerPlanEntregables } from './lib/api'
import { indexarPlan } from './lib/plan'

/** El plan de entregables indexado por Sold To. Si no se puede leer, devuelve `null` y la tabla sigue sin esas columnas. */
export function usePlanEntregables() {
  const [datos, setDatos] = useState<Awaited<ReturnType<typeof leerPlanEntregables>> | null>(null)
  useEffect(() => {
    let cancelado = false
    leerPlanEntregables()
      .then((d) => { if (!cancelado) setDatos(d) })
      .catch(() => undefined)
    return () => { cancelado = true }
  }, [])
  return useMemo(() => (datos && datos.clientes.length > 0 ? indexarPlan(datos.clientes) : null), [datos])
}
