import { afterEach, describe, expect, it, vi } from 'vitest'
import { HttpError, httpClient } from './client'

afterEach(() => vi.unstubAllGlobals())

const responder = (status: number, body: unknown) =>
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })))

describe('errores del backend', () => {
  it('un 422 de validación dice QUÉ campo falló, no «Request failed»', async () => {
    responder(422, { detail: [{ loc: ['body', 'observacion'], msg: 'String should have at most 50 characters' }] })
    const err = (await httpClient.post('/toma-muestras/solicitudes', {}).catch((e: unknown) => e)) as HttpError
    expect(err).toBeInstanceOf(HttpError)
    expect(err.status).toBe(422)
    expect(err.message).toBe('observacion: String should have at most 50 characters')
  })

  it('un detalle de texto se conserva tal cual', async () => {
    responder(409, { detail: 'Ya existe un reanálisis' })
    const err = (await httpClient.post('/x', {}).catch((e: unknown) => e)) as HttpError
    expect(err.message).toBe('Ya existe un reanálisis')
  })

  it('sin JSON, queda el mensaje genérico con el código', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>Bad gateway</html>', { status: 502 })))
    const err = (await httpClient.post('/x', {}).catch((e: unknown) => e)) as HttpError
    expect(err.status).toBe(502)
    expect(err.message).toContain('502')
  })
})
