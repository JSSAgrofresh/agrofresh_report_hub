import { useCallback, useEffect, useRef, useState } from 'react'
import { claveNuevas, obtenerResumen, type ResumenMonitoreo } from '../lib/monitoreo'

export const SEGUNDOS_REFRESCO = 20

interface Claves {
  informes: Set<string>
  solicitudes: Set<string>
  conectados: Set<string>
}

/** El resumen del monitoreo, al día: se vuelve a pedir cada 20 s (solo con la pantalla a la vista) y al volver a ella.
 * `ahoraMs` es la hora del SERVIDOR (corregida por el desfase), nunca el reloj del teléfono a secas. */
export function useMonitoreo() {
  const [datos, setDatos] = useState<ResumenMonitoreo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refrescando, setRefrescando] = useState(false)
  const [desfase, setDesfase] = useState(0)
  const [reloj, setReloj] = useState(() => Date.now())
  const [ultimaVuelta, setUltimaVuelta] = useState(0)
  const [nuevos, setNuevos] = useState<Claves>({ informes: new Set(), solicitudes: new Set(), conectados: new Set() })
  const previas = useRef<Claves | null>(null)
  const cargarRef = useRef<() => Promise<void>>(async () => undefined)

  useEffect(() => {
    let vivo = true
    const cargar = async () => {
      try {
        const r = await obtenerResumen()
        if (!vivo) return
        const claves: Claves = {
          informes: new Set(r.informes.map((i) => String(i.id))),
          solicitudes: new Set(r.solicitudes.map((s) => String(s.id))),
          conectados: new Set(r.conectados.map((c) => c.email)),
        }
        const antes = previas.current
        setNuevos({
          informes: claveNuevas(antes?.informes ?? null, r.informes, (i) => String(i.id)),
          solicitudes: claveNuevas(antes?.solicitudes ?? null, r.solicitudes, (s) => String(s.id)),
          conectados: claveNuevas(antes?.conectados ?? null, r.conectados, (c) => c.email),
        })
        previas.current = claves
        setDesfase(new Date(r.ahora).getTime() - Date.now())
        setDatos(r)
        setError(null)
        setUltimaVuelta(Date.now())
      } catch (e) {
        if (vivo) setError(e instanceof Error ? e.message : 'No se pudo leer el monitoreo.')
      }
    }
    cargarRef.current = cargar
    const periodico = () => { if (!document.hidden) void cargar() }
    void cargar()
    const cada = window.setInterval(periodico, SEGUNDOS_REFRESCO * 1000)
    const alVolver = () => periodico()
    document.addEventListener('visibilitychange', alVolver)
    const segundero = window.setInterval(() => setReloj(Date.now()), 1000)
    return () => {
      vivo = false
      window.clearInterval(cada)
      window.clearInterval(segundero)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [])

  const refrescar = useCallback(async () => {
    setRefrescando(true)
    try {
      await cargarRef.current()
    } finally {
      setRefrescando(false)
    }
  }, [])

  const segundosDesdeVuelta = ultimaVuelta ? Math.max(0, Math.floor((reloj - ultimaVuelta) / 1000)) : 0
  return { datos, error, nuevos, refrescando, refrescar, ahoraMs: reloj + desfase, ultimaVuelta, segundosDesdeVuelta }
}

/** Un número que sube (o baja) hasta su valor con una animación corta. Con «reducir movimiento» salta directo. */
export function useContador(objetivo: number, ms = 900): number {
  const [valor, setValor] = useState(0)
  const actual = useRef(0)
  useEffect(() => {
    const reducir = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const desde = actual.current
    const inicio = performance.now()
    let id = 0
    const paso = (t: number) => {
      const p = reducir ? 1 : Math.min(1, (t - inicio) / ms)
      const suave = 1 - Math.pow(1 - p, 3)
      const v = Math.round(desde + (objetivo - desde) * suave)
      actual.current = v
      setValor(v)
      if (p < 1) id = requestAnimationFrame(paso)
    }
    id = requestAnimationFrame(paso)
    return () => cancelAnimationFrame(id)
  }, [objetivo, ms])
  return valor
}
