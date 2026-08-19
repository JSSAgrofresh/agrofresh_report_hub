const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'

export class HttpError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })

  if (!response.ok) {
    throw new HttpError(response.status, `Request failed: ${response.status} ${path}`)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

export const httpClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  /** Para subir archivos (FormData): sin Content-Type fijo, el navegador pone
   * el boundary del multipart solo. */
  upload: <T>(path: string, formData: FormData) => {
    async function ejecutar(): Promise<T> {
      const response = await fetch(`${API_BASE_URL}${path}`, { method: 'POST', body: formData })
      if (!response.ok) throw new HttpError(response.status, `Request failed: ${response.status} ${path}`)
      return (await response.json()) as T
    }
    return ejecutar()
  },
  /** Para endpoints que devuelven un archivo (ej. un Excel generado) en vez de JSON. */
  postArchivo: async (path: string, body: unknown): Promise<Blob> => {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!response.ok) throw new HttpError(response.status, `Request failed: ${response.status} ${path}`)
    return response.blob()
  },
}
