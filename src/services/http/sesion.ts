/**
 * El token de sesión, en un solo lugar.
 *
 * Vive acá y no en el estado de React porque `httpClient` tiene que poder
 * leerlo en cada llamada, y `httpClient` no es un componente. La copia en
 * `localStorage` es solo para que recargar la página no cierre la sesión;
 * la copia de memoria es la que manda.
 *
 * Nada de esto es un permiso. El token dice quién eres; qué puedes ver lo
 * decide el backend en cada request. Borrarlo del navegador cierra tu
 * sesión, no te da acceso a nada.
 */
const CLAVE = 'agrofresh.token.v1'

let token: string | null = leerGuardado()

function leerGuardado(): string | null {
  try {
    return window.localStorage.getItem(CLAVE)
  } catch {
    // Navegador con el almacenamiento bloqueado: se puede trabajar igual,
    // solo que la sesión no sobrevive a recargar la página.
    return null
  }
}

export function tokenActual(): string | null {
  return token
}

export function guardarToken(nuevo: string | null): void {
  token = nuevo
  try {
    if (nuevo) window.localStorage.setItem(CLAVE, nuevo)
    else window.localStorage.removeItem(CLAVE)
  } catch { /* ver leerGuardado */ }
}

type Aviso = () => void
let avisos: Aviso[] = []

/**
 * Avisa cuando el backend rechaza el token: venció, lo revocaron, o a la
 * cuenta le cambiaron los permisos. Lo usa `AuthProvider` para llevar a la
 * pantalla de ingreso en vez de dejar la aplicación mostrando datos viejos
 * y errores en cada pantalla.
 */
export function alPerderSesion(aviso: Aviso): () => void {
  avisos.push(aviso)
  return () => {
    avisos = avisos.filter((a) => a !== aviso)
  }
}

export function sesionRechazada(): void {
  if (!token) return // ya estábamos fuera: no hay nada que avisar
  guardarToken(null)
  avisos.forEach((a) => a())
}
