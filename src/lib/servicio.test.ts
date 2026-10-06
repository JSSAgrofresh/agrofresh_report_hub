import { describe, expect, it } from 'vitest'
import { parametroServicio, servicioDeTipoAplicacion } from './servicio'

// Mismos casos que test_clave_servicio en backend/tests/test_servicio_actimist.py.
describe('servicioDeTipoAplicacion', () => {
  it.each([
    ['Actimist', 'actimist'],
    ['ACTIMIST ', 'actimist'],
    ['actimist', 'actimist'],
    ['Ecofog', 'ecofog'],
    ['ECOFOG ', 'ecofog'],
    ['Línea de proceso', 'linea'],
    ['RYD', 'linea'],
    ['', 'linea'],
    [null, 'linea'],
    [undefined, 'linea'],
    ['otra cosa', 'linea'],
  ])('%s → %s', (tipo, esperado) => {
    expect(servicioDeTipoAplicacion(tipo)).toBe(esperado)
  })
})

describe('parametroServicio', () => {
  it('Línea de proceso va vacío, como antes de separar los servicios', () => {
    expect(parametroServicio('linea')).toBe('')
    expect(parametroServicio('actimist')).toBe('actimist')
    expect(parametroServicio('ecofog')).toBe('ecofog')
    expect(parametroServicio('ryd')).toBe('ryd')   // la lista de RYD es aparte, el listado sigue siendo el de Línea
  })
})
