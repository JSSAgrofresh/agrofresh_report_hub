import { useEffect, useState } from 'react'
import { leerMiDiseno } from '../api/panelInicioApi'
import type { Pieza } from '../lib/grilla'

/** El diseño del Panel general que le toca a esta cuenta. Si falla o no hay, `piezas` queda vacío y
 * el panel de siempre se muestra igual: personalizar nunca puede dejar a alguien sin panel. */
export function useMiDiseno() {
  const [estado, setEstado] = useState<{ cargando: boolean; piezas: Pieza[] }>({ cargando: true, piezas: [] })
  useEffect(() => {
    let cancelado = false
    leerMiDiseno()
      .then((d) => { if (!cancelado) setEstado({ cargando: false, piezas: d.piezas ?? [] }) })
      .catch(() => { if (!cancelado) setEstado({ cargando: false, piezas: [] }) })
    return () => { cancelado = true }
  }, [])
  return estado
}
