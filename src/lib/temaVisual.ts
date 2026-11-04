/**
 * Tema claro / oscuro del marco interno (barra lateral).
 *
 * Se guarda en el navegador de cada persona (`localStorage`) y se aplica como `data-tema` en <html>; los
 * estilos están en `styles/mejoras-visuales.css`. Sin elección guardada parte en claro. El portal de clientes y
 * comerciales no lo usa: allí manda su propio estilo (Básico / Sobrio).
 */
import { useCallback, useSyncExternalStore } from 'react'

export type TemaVisual = 'claro' | 'oscuro'

const CLAVE = 'agrofresh.tema-visual.v1'
const aviso = new Set<() => void>()

export function leerTema(): TemaVisual {
  try {
    return window.localStorage.getItem(CLAVE) === 'oscuro' ? 'oscuro' : 'claro'
  } catch {
    return 'claro' // almacenamiento bloqueado: se usa claro y no se recuerda
  }
}

export function aplicarTema(tema: TemaVisual): void {
  document.documentElement.dataset.tema = tema
}

export function guardarTema(tema: TemaVisual): void {
  try {
    window.localStorage.setItem(CLAVE, tema)
  } catch { /* sin almacenamiento: vale para esta pestaña */ }
  aplicarTema(tema)
  aviso.forEach((f) => f())
}

/** Se llama antes de pintar la aplicación para que no haya un destello claro al abrir en oscuro. */
export function aplicarTemaGuardado(): void {
  aplicarTema(leerTema())
}

function suscribir(f: () => void) {
  aviso.add(f)
  return () => { aviso.delete(f) }
}

export function useTemaVisual() {
  const tema = useSyncExternalStore(suscribir, leerTema, () => 'claro' as TemaVisual)
  const alternar = useCallback(() => guardarTema(leerTema() === 'oscuro' ? 'claro' : 'oscuro'), [])
  return { tema, alternar }
}
