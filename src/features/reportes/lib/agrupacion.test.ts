import { describe, expect, it } from 'vitest'
import { lunesDe, solicitudesPor } from './agrupacion'
import type { Observacion } from './tipos'

function obs(solicitudId: number, crop: string | null): Observacion {
  return {
    solicitudId,
    nroSolicitud: `S-${solicitudId}`,
    ingrediente: 'IMZ',
    ppm: 1,
    valorTexto: null,
    fecha: '2026-09-23',
    cliente: null,
    planta: null,
    tipoAplicacion: null,
    tipoServicio: null,
    posicionMuestreo: null,
    laboratorio: 'Agrofresh',
    crop,
    variedad: null,
    semana: 39,
    mes: 9,
  }
}

describe('lunesDe', () => {
  it('lleva cualquier día al lunes de su semana (ISO: la semana parte el lunes)', () => {
    expect(lunesDe('2026-09-21')).toBe('2026-09-21') // lunes
    expect(lunesDe('2026-09-23')).toBe('2026-09-21') // miércoles
    expect(lunesDe('2026-09-27')).toBe('2026-09-21') // domingo: sigue siendo la semana del 21
    expect(lunesDe('2026-09-28')).toBe('2026-09-28')
  })

  it('cruza meses y años', () => {
    expect(lunesDe('2026-01-01')).toBe('2025-12-29')
    expect(lunesDe('2026-03-01')).toBe('2026-02-23')
  })

  it('acepta fecha con hora y deja igual un texto que no es fecha', () => {
    expect(lunesDe('2026-09-23T15:00:00')).toBe('2026-09-21')
    expect(lunesDe('Sin fecha')).toBe('Sin fecha')
  })
})

describe('solicitudesPor', () => {
  it('cuenta solicitudes distintas, no filas de resultado', () => {
    // La solicitud 1 trae dos resultados (dos analitos): cuenta una vez.
    const r = solicitudesPor(
      [obs(1, 'Cereza'), obs(1, 'Cereza'), obs(2, 'Cereza'), obs(3, 'Pera')],
      'crop',
    )
    expect(r).toEqual([
      { valor: 'Cereza', n: 2 },
      { valor: 'Pera', n: 1 },
    ])
  })

  it('junta variantes con tildes o mayúsculas y descarta vacíos', () => {
    const r = solicitudesPor(
      [obs(1, 'Arándano'), obs(2, 'ARANDANO'), obs(3, null), obs(4, '  ')],
      'crop',
    )
    expect(r).toEqual([{ valor: 'Arándano', n: 2 }])
  })

  it('empata por nombre para que el orden sea estable', () => {
    const r = solicitudesPor([obs(1, 'Pera'), obs(2, 'Kiwi')], 'crop')
    expect(r.map((x) => x.valor)).toEqual(['Kiwi', 'Pera'])
  })
})
