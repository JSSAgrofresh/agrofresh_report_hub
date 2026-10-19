import { describe, expect, it } from 'vitest'
import { parametroServicio, servicioDeFila, servicioDeTipoAplicacion } from './servicio'

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

describe('servicioDeFila (Report: Tipo de servicio)', () => {
  it('manda solicitud.servicio', () => {
    expect(servicioDeFila('actimist', null)).toBe('Actimist')
    expect(servicioDeFila('ecofog', 'Línea de proceso')).toBe('Ecofog')
    expect(servicioDeFila('ryd', null)).toBe('RYD')
    expect(servicioDeFila('linea', 'Actimist')).toBe('Línea de proceso')
  })
  it('sin servicio guardado (lo cargado antes) se deduce del Tipo Aplicación', () => {
    expect(servicioDeFila(null, ' ACTIMIST ')).toBe('Actimist')
    expect(servicioDeFila('', 'Ecofog')).toBe('Ecofog')
    expect(servicioDeFila(null, 'RYD')).toBe('RYD')
  })
  it('sin ningún dato es Línea de proceso', () => {
    expect(servicioDeFila(null, null)).toBe('Línea de proceso')
    expect(servicioDeFila(undefined, 'Fogger')).toBe('Línea de proceso')
  })
})
