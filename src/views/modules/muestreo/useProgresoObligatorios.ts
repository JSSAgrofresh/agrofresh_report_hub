import { useEffect, useState } from 'react'

export interface ProgresoObligatorios {
  listos: number
  total: number
}

interface Clases {
  /** Contenedor de un campo (etiqueta + control). */
  campo: string
  /** Título de cada sección del formulario. */
  seccion: string
}

/**
 * Solo LEE el formulario para pintar qué obligatorios faltan; no guarda ni
 * valida nada (eso lo sigue haciendo `onSubmit`).
 *
 * Marca cada campo obligatorio con `data-estado="falta" | "listo"` y cada
 * título de sección con `data-faltan="N"`, y devuelve el conteo para la barra
 * de arriba. El CSS pone el resto. «Listo» significa que el campo tiene algo
 * escrito o elegido.
 */
export function useProgresoObligatorios(clases: Clases) {
  const [form, setForm] = useState<HTMLFormElement | null>(null)
  const [progreso, setProgreso] = useState<ProgresoObligatorios>({ listos: 0, total: 0 })
  const { campo, seccion } = clases

  useEffect(() => {
    if (!form) return
    let cuadro = 0

    function llenoCampo(el: HTMLElement): boolean {
      const control = el.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
        'input:not([type=hidden]), select, textarea',
      )
      if (!control) return false
      if (control instanceof HTMLInputElement && control.type === 'checkbox') {
        return el.querySelector('input:checked') !== null
      }
      return control.value.trim() !== ''
    }

    function revisar() {
      cuadro = 0
      let listos = 0
      let total = 0
      form!.querySelectorAll<HTMLElement>(`.${campo}`).forEach((el) => {
        // El asterisco de «obligatorio» lleva `data-obligatorio`.
        if (!el.querySelector('[data-obligatorio]')) return
        const lleno = llenoCampo(el)
        total += 1
        if (lleno) listos += 1
        el.dataset.estado = lleno ? 'listo' : 'falta'
      })
      form!.querySelectorAll<HTMLElement>(`.${seccion}`).forEach((titulo) => {
        const tarjeta = titulo.parentElement
        const faltan = tarjeta ? tarjeta.querySelectorAll('[data-estado="falta"]').length : 0
        const hay = tarjeta ? tarjeta.querySelectorAll('[data-estado]').length : 0
        if (faltan > 0) titulo.dataset.faltan = String(faltan)
        else delete titulo.dataset.faltan
        if (hay > 0 && faltan === 0) titulo.dataset.completo = 'si'
        else delete titulo.dataset.completo
      })
      setProgreso((p) => (p.listos === listos && p.total === total ? p : { listos, total }))
    }

    function programar() {
      if (!cuadro) cuadro = requestAnimationFrame(revisar)
    }

    form.addEventListener('input', programar)
    form.addEventListener('change', programar)
    // Aparecen o desaparecen campos al cambiar laboratorio o tipo de aplicación.
    const observador = new MutationObserver(programar)
    observador.observe(form, { childList: true, subtree: true })
    revisar()
    return () => {
      form.removeEventListener('input', programar)
      form.removeEventListener('change', programar)
      observador.disconnect()
      if (cuadro) cancelAnimationFrame(cuadro)
    }
  }, [form, campo, seccion])

  return { formRef: setForm, progreso }
}
