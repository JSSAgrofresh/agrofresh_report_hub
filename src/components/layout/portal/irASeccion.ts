import { ALTO_BARRA_PEGADA } from './FiltrosPegajosos'

/**
 * Lleva suavemente a una sección del Report dejando su título justo bajo la barra del portal (y bajo los filtros, que al
 * bajar se pegan a ella). Al bajar, la tarjeta de filtros se pega y deja de ocupar su lugar, así que lo de abajo sube: se
 * calcula desde el principio dónde quedará el título (con los filtros ya pegados) y se va ahí de UN solo movimiento
 * suave; recién cuando la página dejó de moverse se afina lo que falte, sin saltos intermedios.
 */
export function irASeccion(id: string) {
  const nav = document.querySelector('nav[aria-label="Secciones"]')
  const base0 = nav?.getBoundingClientRect().bottom ?? 0
  const el = document.getElementById(id)
  if (!el) return
  const pegada = document.querySelector<HTMLElement>('[data-pegado="true"]')
  const tarjeta = document.querySelector<HTMLElement>('section[aria-label="Filtros"]')
  const barra = ALTO_BARRA_PEGADA
  const sinColapso = window.scrollY + el.getBoundingClientRect().top - (base0 + barra + 12)
  // La tarjeta solo se pega (y libera su lugar) si, ya en el destino, su sitio queda por encima de la barra.
  const hueco = tarjeta?.parentElement
  const huecoY = hueco ? window.scrollY + hueco.getBoundingClientRect().top : Infinity
  const seVaAPegar = !pegada && huecoY - sinColapso <= base0 + barra + 18
  const destino = seVaAPegar ? sinColapso - (tarjeta?.offsetHeight ?? 0) : sinColapso
  window.scrollTo({ top: Math.max(0, destino), behavior: 'smooth' })
  // Afinado: cuando la página lleva 360 ms quieta (y los filtros ya terminaron de pegarse), si el título no quedó bajo la barra se corrige una sola vez.
  let ultimo = window.scrollY
  let quieto = 0
  let transcurrido = 0
  const vigilar = window.setInterval(() => {
    transcurrido += 40
    quieto = Math.abs(window.scrollY - ultimo) < 1 ? quieto + 40 : 0
    ultimo = window.scrollY
    if (quieto < 360 || transcurrido < 800) return
    window.clearInterval(vigilar)
    const e2 = document.getElementById(id)
    const p2 = document.querySelector('[data-pegado="true"]')
    const base = Math.max(nav?.getBoundingClientRect().bottom ?? 0, p2?.getBoundingClientRect().bottom ?? 0)
    const falta = (e2?.getBoundingClientRect().top ?? 0) - (base + 16)
    if (e2 && (falta < -8 || falta > 40)) window.scrollBy({ top: falta, behavior: 'smooth' })
  }, 40)
  window.setTimeout(() => window.clearInterval(vigilar), 3000)
}
