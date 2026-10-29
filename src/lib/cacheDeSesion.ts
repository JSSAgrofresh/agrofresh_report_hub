import { tokenActual } from '@/services/http/sesion'

/**
 * Lo último que se pidió al servidor, en memoria, para que cambiar de pantalla no vuelva a mostrar «cargando»: se dibuja
 * lo que ya se tenía y, en paralelo, se pide lo nuevo. La clave lleva la sesión (el token): al entrar otra cuenta, o al
 * volver a entrar, nada de lo guardado le sirve, y lo que se guardó de una cuenta nunca se le muestra a otra. Se pierde
 * al recargar la página y guarda pocas entradas (las últimas usadas).
 */
export function crearCacheDeSesion<T>(maximo = 8) {
  const guardado = new Map<string, T>()
  const clave = (k: string) => `${tokenActual() ?? 'sin-sesion'}|${k}`
  return {
    leer(k: string): T | undefined {
      const c = clave(k)
      const v = guardado.get(c)
      if (v === undefined) return undefined
      // Se vuelve a poner al final: lo usado hace menos es lo primero que sale cuando falta lugar.
      guardado.delete(c)
      guardado.set(c, v)
      return v
    },
    guardar(k: string, v: T): void {
      const c = clave(k)
      guardado.delete(c)
      guardado.set(c, v)
      while (guardado.size > maximo) guardado.delete(guardado.keys().next().value as string)
    },
  }
}
