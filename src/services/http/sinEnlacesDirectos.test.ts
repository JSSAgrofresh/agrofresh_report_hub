import { describe, expect, it } from 'vitest'

/**
 * Ningún archivo del backend puede pedirse con un enlace directo.
 *
 * Cuando la API pasó a exigir sesión, seis descargas se rompieron a la vez:
 * eran `<a href="/api/...">`, y un enlace lo sigue el navegador por su
 * cuenta, sin forma de mandar el encabezado con el token. El servidor
 * respondía 401, y no se notaba hasta que alguien intentaba bajar algo.
 *
 * El patrón que las delataba era construir la URL a mano con
 * `VITE_API_BASE_URL` fuera de la capa HTTP. Esta prueba lo prohíbe: para
 * bajar un archivo está `descargarArchivo`, que sí manda el token.
 */

// Se lee el código fuente con el glob de Vite y no con `node:fs` para no
// depender de desde dónde se corran las pruebas.
const FUENTES = import.meta.glob('/src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/** Puede leer la variable porque es quien arma TODAS las llamadas. */
const CAPA_HTTP = '/src/services/http/client.ts'
/** No llama al backend: le pasa la URL al iframe, y ese sí manda el token
 * (ver la función `autorizacion` en public/modules/trace.html). */
const PASA_LA_URL_AL_IFRAME = '/src/views/modules/trace/TraceView.tsx'
/** Declaración de tipos de Vite, no código. */
const TIPOS = '/src/vite-env.d.ts'

function revisar(patron: RegExp, permitidos: string[]): string[] {
  return Object.entries(FUENTES)
    .filter(([ruta]) => !/\.test\.tsx?$/.test(ruta) && !permitidos.includes(ruta))
    .filter(([, codigo]) => patron.test(codigo))
    .map(([ruta]) => ruta)
    .sort()
}

describe('llamadas al backend', () => {
  it('nadie arma URLs del backend fuera de la capa HTTP', () => {
    expect(
      revisar(/VITE_API_BASE_URL/, [CAPA_HTTP, PASA_LA_URL_AL_IFRAME, TIPOS]),
      'Estos arman una URL del backend a mano. Si es para bajar un archivo, ' +
        'usa `descargarArchivo` de services/http/descargar: un <a href> no puede ' +
        'llevar el token y el servidor responde 401.',
    ).toEqual([])
  })

  it('nadie llama a fetch() sin pasar por httpClient', () => {
    expect(
      revisar(/(?<![\w.])fetch\(/, [CAPA_HTTP]),
      'httpClient es lo único que agrega el token. Un fetch() suelto no lo manda.',
    ).toEqual([])
  })
})
