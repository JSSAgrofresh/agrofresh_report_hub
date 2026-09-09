import { describe, expect, it } from 'vitest'
import { explicarErrorDeConfig } from './errores'
import { HttpError } from '@/services/http/client'

/**
 * Esto existe por un caso real: el frontend se desplegó solo al pushear y el
 * backend del servidor seguía siendo el viejo, así que `/config` respondió
 * 404 — y la pantalla dijo "¿está el backend arriba?" mientras el backend
 * contestaba perfectamente todo lo demás. Un aviso que apunta al lugar
 * equivocado hace perder más tiempo que no tener aviso.
 */
describe('explicarErrorDeConfig', () => {
  it('un 404 manda a actualizar y REINICIAR el backend', () => {
    const mensaje = explicarErrorDeConfig(new HttpError(404, 'Not Found'))
    expect(mensaje).toMatch(/no conoce este módulo/)
    expect(mensaje).toMatch(/reiniciar/i)
    expect(mensaje).not.toMatch(/¿Está el backend arriba\?/)
  })

  it('un 500 manda a correr la migración', () => {
    expect(explicarErrorDeConfig(new HttpError(500, 'UndefinedTable'))).toMatch(
      /migración.*0026/,
    )
  })

  it('sin respuesta del backend, manda a levantarlo', () => {
    expect(explicarErrorDeConfig(new TypeError('Failed to fetch'))).toMatch(
      /Revisa que esté corriendo/,
    )
  })
})
