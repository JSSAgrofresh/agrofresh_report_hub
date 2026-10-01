import { useEffect } from 'react'

/**
 * En celular, las tablas marcadas con `data-apilar` se muestran como tarjetas
 * (ver `globals.css`). Cada celda necesita su etiqueta, y es la del
 * encabezado de su columna: este hook la copia a `data-label`, también en
 * las filas que aparecen después (se filtra, se carga, se agrega una).
 * La primera columna es el título de la tarjeta y no lleva etiqueta.
 */
export function etiquetarTablas(raiz: ParentNode): void {
  raiz.querySelectorAll<HTMLTableElement>('table[data-apilar]').forEach((tabla) => {
    const filaEnc = tabla.tHead?.rows[tabla.tHead.rows.length - 1]
    if (!filaEnc) return
    const etiquetas = Array.from(filaEnc.cells).map((th) => (th.textContent ?? '').replace(/\s+/g, ' ').trim())
    Array.from(tabla.tBodies).forEach((cuerpo) => {
      Array.from(cuerpo.rows).forEach((fila) => {
        Array.from(fila.cells).forEach((celda, i) => {
          const etiqueta = i === 0 ? '' : (etiquetas[i] ?? '')
          if (celda.dataset.label !== etiqueta) celda.dataset.label = etiqueta
        })
      })
    })
  })
}

export function useApilarTablas(raiz: React.RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = raiz.current
    if (!el) return
    let pendiente = 0
    const programar = () => {
      cancelAnimationFrame(pendiente)
      pendiente = requestAnimationFrame(() => etiquetarTablas(el))
    }
    etiquetarTablas(el)
    const obs = new MutationObserver(programar)
    obs.observe(el, { childList: true, subtree: true })
    return () => {
      obs.disconnect()
      cancelAnimationFrame(pendiente)
    }
  }, [raiz])
}
