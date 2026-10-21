import { describe, expect, it } from 'vitest'
import { compararDestinatarios, hallazgoPrincipal, resumenInforme } from './revision'

describe('compararDestinatarios', () => {
  const esperado = { to: ['ana@cliente.cl', 'Luis@cliente.cl'], cc: ['com@agrofresh.com'], bcc: ['hub@gmail.com'] }

  it('marca como esperado a quien llegó en Para o en Copia, sin importar mayúsculas', () => {
    const filas = compararDestinatarios(esperado, { para: ['ana@cliente.cl'], cc: ['luis@CLIENTE.cl', 'com@agrofresh.com'], bcc: [] })
    expect(filas.map((f) => [f.correo, f.tipo])).toEqual([
      ['ana@cliente.cl', 'esperado'],
      ['luis@cliente.cl', 'esperado'],
      ['com@agrofresh.com', 'esperado'],
    ])
  })

  it('el caso del 1914: nadie de la lista llegó y salió a gente de otro cliente', () => {
    const filas = compararDestinatarios(esperado, { para: ['patricio@unifrutti.com'], cc: [], bcc: ['hub@gmail.com'] }, [])
    expect(filas.filter((f) => f.tipo === 'falta')).toHaveLength(3)
    const demas = filas.filter((f) => f.tipo === 'demas')
    expect(demas.map((f) => f.correo)).toEqual(['patricio@unifrutti.com'])
    expect(demas[0].interno).toBe(false)
  })

  it('nuestras propias cuentas y la copia oculta esperada no cuentan como de más', () => {
    const filas = compararDestinatarios(
      { to: ['ana@cliente.cl'], cc: [], bcc: ['tecnico@agrofresh.com'] },
      { para: ['ana@cliente.cl'], cc: ['reporthub@gmail.com'], bcc: ['tecnico@agrofresh.com'] },
      ['reporthub@gmail.com'],
    )
    expect(filas.some((f) => f.tipo === 'demas')).toBe(false)
  })

  it('una copia de más de AgroFresh se distingue de una de afuera', () => {
    const filas = compararDestinatarios({ to: ['ana@cliente.cl'] }, { para: ['ana@cliente.cl'], cc: ['otro@agrofresh.com'], bcc: [] })
    expect(filas.find((f) => f.tipo === 'demas')?.interno).toBe(true)
  })
})

describe('hallazgoPrincipal y resumenInforme', () => {
  it('toma el hallazgo más grave', () => {
    const h = hallazgoPrincipal([
      { nivel: 'amarillo', codigo: 'a', texto: 'A' },
      { nivel: 'rojo', codigo: 'r', texto: 'R' },
    ])
    expect(h?.codigo).toBe('r')
    expect(hallazgoPrincipal([])).toBeNull()
  })

  it('resume el informe en una línea', () => {
    expect(resumenInforme({ laboratorio: 'Quiteca', nro_informe: '2026-1914-PC', ot: 'OT-QUI0053' })).toBe('Quiteca · 2026-1914-PC · OT-QUI0053')
    expect(resumenInforme({ laboratorio: null, nro_informe: null, ot: null })).toBe('Sin identificar')
  })
})
