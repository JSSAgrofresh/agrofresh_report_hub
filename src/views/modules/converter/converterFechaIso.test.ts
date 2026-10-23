/**
 * `aFecha` de public/modules/converter.html y su espejo en Python (`quiteca_lectura.a_fecha`).
 * La fecha de recepción de la solicitud llega «2026-10-02» y el patrón día-mes-año la leía como «26-10-02»
 * (26 de octubre de 2002): 26 informes propios de AgroFresh quedaron con fecha de entrada de 2001 a 2005.
 */
import { describe, expect, it } from 'vitest'
import html from '../../../../public/modules/converter.html?raw'

const inicio = html.indexOf('/* Lógica del conversor')
const fin = html.indexOf('/* ============ interfaz')

function cargar(): (txt: string | null, avisos?: string[]) => string | null {
  const fuente = html.slice(inicio, fin)
  return new Function(`${fuente}\nreturn aFecha`)() as (txt: string | null, avisos?: string[]) => string | null
}

describe('aFecha', () => {
  const aFecha = cargar()

  it('una fecha año-mes-día se lee entera (la de la solicitud)', () => {
    expect(aFecha('2026-10-02')).toBe('02-10-2026')
    expect(aFecha('2026-10-01')).toBe('01-10-2026')
    expect(aFecha('2026-09-30T14:00:00')).toBe('30-09-2026')
  })

  it('las fechas día-mes-año de siempre no cambian', () => {
    expect(aFecha('02-10-2026')).toBe('02-10-2026')
    expect(aFecha('2/10/26')).toBe('02-10-2026')
    expect(aFecha('Fecha: 15-10-2026 15:10')).toBe('15-10-2026')
  })

  it('el mes/día invertido se sigue corrigiendo y lo que no es fecha da nulo', () => {
    const avisos: string[] = []
    expect(aFecha('10-26-2026', avisos)).toBe('26-10-2026')
    expect(avisos).toHaveLength(1)
    expect(aFecha('2026-13-02')).toBeNull()
    expect(aFecha('sin fecha')).toBeNull()
  })
})
