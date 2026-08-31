import { sesionRechazada, tokenActual } from './sesion'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'

export class HttpError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

/**
 * Toda llamada al backend pasa por acá, y por eso el token se agrega acá: si
 * cada módulo tuviera que acordarse de mandarlo, el que se olvide no falla
 * al escribirlo sino en producción, con un 401 que nadie entiende.
 */
async function pedir(path: string, init: RequestInit = {}): Promise<Response> {
  const token = tokenActual()
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  // 401 significa que este token ya no sirve —venció, lo revocaron, o a la
  // cuenta le cambiaron los permisos—. Se descarta acá para que la aplicación
  // entera reaccione una vez, en vez de que cada pantalla muestre su error.
  if (response.status === 401) sesionRechazada()
  return response
}

async function fallar(response: Response, path: string): Promise<never> {
  let detalle = ''
  try {
    const body = await response.json() as { detail?: string }
    detalle = typeof body.detail === 'string' ? body.detail : ''
  } catch { /* el backend no siempre devuelve JSON */ }
  throw new HttpError(response.status, detalle || `Request failed: ${response.status} ${path}`)
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await pedir(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })

  if (!response.ok) await fallar(response, path)
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

/** Blob + el nombre real que puso el backend en Content-Disposition (útil
 * cuando el nombre puede ser .pdf o .zip según cuántas filas se manden). */
async function archivo(path: string, init?: RequestInit): Promise<{ blob: Blob; nombre: string | null }> {
  const response = await pedir(path, init)
  if (!response.ok) await fallar(response, path)
  const disposicion = response.headers.get('Content-Disposition') ?? ''
  const m = disposicion.match(/filename="?([^";]+)"?/)
  return { blob: await response.blob(), nombre: m ? m[1] : null }
}

const conJson = (metodo: string, body: unknown): RequestInit => ({
  method: metodo,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export const httpClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  /** Para subir archivos (FormData): sin Content-Type fijo, el navegador pone
   * el boundary del multipart solo. */
  upload: async <T>(path: string, formData: FormData): Promise<T> => {
    const response = await pedir(path, { method: 'POST', body: formData })
    if (!response.ok) await fallar(response, path)
    return (await response.json()) as T
  },
  /** Para endpoints que devuelven un archivo (ej. un Excel generado) en vez de JSON. */
  postArchivo: async (path: string, body: unknown): Promise<Blob> =>
    (await archivo(path, conJson('POST', body))).blob,
  postArchivoConNombre: (path: string, body: unknown) => archivo(path, conJson('POST', body)),
  /** Igual que postArchivoConNombre, pero para endpoints GET que devuelven un
   * archivo generado (ej. exportar todo el historial de un cliente). */
  getArchivoConNombre: (path: string) => archivo(path),
}
