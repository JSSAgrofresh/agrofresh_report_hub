import { describe, expect, it } from 'vitest'
import { esCorreoValido, quitarCorreo, separarCorreos, sumarCorreos, tamanoLegible } from './correos'

describe('separarCorreos', () => {
  it('separa por punto y coma, coma, espacios y saltos de línea', () => {
    expect(separarCorreos('a@x.cl; b@x.cl, c@x.cl\nd@x.cl  e@x.cl')).toEqual([
      'a@x.cl', 'b@x.cl', 'c@x.cl', 'd@x.cl', 'e@x.cl',
    ])
  })

  it('entiende el formato de Outlook «Nombre <correo>»', () => {
    expect(separarCorreos('Ana <ana@x.cl>;"Luis" <luis@x.cl>')).toEqual(['ana@x.cl', 'luis@x.cl'])
    expect(separarCorreos('"Pérez, Ana" <ana@x.cl>, Luis Soto <luis@x.cl>')).toEqual(['ana@x.cl', 'luis@x.cl'])
  })

  it('lo que no parece correo se conserva: la pantalla lo marca en rojo', () => {
    expect(separarCorreos('roto')).toEqual(['roto'])
  })

  it('un texto vacío no da nada', () => {
    expect(separarCorreos('  ;; ,')).toEqual([])
  })
})

describe('sumarCorreos y quitarCorreo', () => {
  it('no repite sin importar mayúsculas y conserva el orden', () => {
    expect(sumarCorreos(['a@x.cl'], ['A@x.cl', 'b@x.cl', 'B@X.cl'])).toEqual(['a@x.cl', 'b@x.cl'])
  })

  it('quita sin importar mayúsculas', () => {
    expect(quitarCorreo(['a@x.cl', 'b@x.cl'], 'A@X.CL')).toEqual(['b@x.cl'])
  })
})

describe('esCorreoValido', () => {
  it.each([
    ['ana@empresa.cl', true],
    [' ana@empresa.cl ', true],
    ['ana@empresa', false],
    ['ana empresa.cl', false],
    ['', false],
  ])('%s → %s', (valor, esperado) => {
    expect(esCorreoValido(valor)).toBe(esperado)
  })
})

describe('tamanoLegible', () => {
  it('usa la unidad que corresponde', () => {
    expect(tamanoLegible(500)).toBe('500 B')
    expect(tamanoLegible(2048)).toBe('2 KB')
    expect(tamanoLegible(5 * 1024 * 1024)).toBe('5.0 MB')
  })
})
