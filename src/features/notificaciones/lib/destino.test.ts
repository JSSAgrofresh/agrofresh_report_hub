import { describe, expect, it } from 'vitest'
import { TIPOS_CUENTA, TODOS_LOS_TIPOS, destinoDe, resumenDestino } from './destino'

describe('destino de un aviso', () => {
  it('los clientes no son un destino', () => {
    expect(TIPOS_CUENTA.map((t) => t.id)).not.toContain('cliente' as never)
  })

  it('un aviso nuevo trae sus tipos elegidos', () => {
    expect(destinoDe({ audiencia: 'todos', metadata: { tipo: 'anuncio', tipos_destino: ['analista'] } })).toEqual(['analista'])
  })

  it('los avisos antiguos se traducen desde su audiencia', () => {
    expect(destinoDe({ audiencia: 'todos', metadata: null })).toEqual(TODOS_LOS_TIPOS)
    expect(destinoDe({ audiencia: 'admin_general', metadata: null })).toEqual(['admin_general'])
    expect(destinoDe({ audiencia: 'cromatografia', metadata: null })).toEqual(['admin_general', 'admin_area', 'analista'])
  })

  it('resume el destino en una frase', () => {
    expect(resumenDestino([...TODOS_LOS_TIPOS])).toBe('Todos los usuarios internos')
    expect(resumenDestino(['muestreador', 'gerencia'])).toBe('Gerencia, Muestreadores')
  })
})
