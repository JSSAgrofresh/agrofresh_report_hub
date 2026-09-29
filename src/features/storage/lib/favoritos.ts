import { useCallback, useState } from 'react'
import type { Espacio } from './explorador'

export interface Favorito {
  espacio: Espacio['id']
  ruta: string
  nombre: string
}

const CLAVE = 'agrofresh.storage.favoritos.v1'

function leer(): Favorito[] {
  try {
    const bruto = window.localStorage.getItem(CLAVE)
    const lista: unknown = bruto ? JSON.parse(bruto) : []
    if (!Array.isArray(lista)) return []
    return lista.filter(
      (f): f is Favorito =>
        typeof f?.espacio === 'string' && typeof f?.ruta === 'string' && typeof f?.nombre === 'string',
    )
  } catch {
    return []
  }
}

function guardar(lista: Favorito[]) {
  try {
    window.localStorage.setItem(CLAVE, JSON.stringify(lista))
  } catch {
    // Almacenamiento bloqueado: los favoritos duran lo que dure la pantalla.
  }
}

/** Carpetas fijadas por cada persona; viven en su navegador, no en el servidor. */
export function useFavoritos() {
  const [favoritos, setFavoritos] = useState<Favorito[]>(leer)

  const esFavorito = useCallback(
    (espacio: Espacio['id'], ruta: string) => favoritos.some((f) => f.espacio === espacio && f.ruta === ruta),
    [favoritos],
  )

  const alternar = useCallback((fav: Favorito) => {
    setFavoritos((actual) => {
      const ya = actual.some((f) => f.espacio === fav.espacio && f.ruta === fav.ruta)
      const nueva = ya ? actual.filter((f) => !(f.espacio === fav.espacio && f.ruta === fav.ruta)) : [...actual, fav]
      guardar(nueva)
      return nueva
    })
  }, [])

  return { favoritos, esFavorito, alternar }
}
