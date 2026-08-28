import { describe, expect, it } from 'vitest'
import { modulosPermitidos, puedeVerReporte, puedeVerTomaMuestras } from './permisos'
import type { Usuario } from './types'

const cromatografia: Usuario = {
  id: 'test-crom',
  email: 'cromatografia@agrofresh.com',
  nombre: 'Admin Cromatografía',
  tipoAcceso: 'admin_area',
  area: 'cromatografia',
}

describe('permisos configurables de usuarios', () => {
  it('da al admin de Cromatografía los accesos operativos solicitados por defecto', () => {
    expect(modulosPermitidos(cromatografia).map((modulo) => modulo.id)).toEqual([
      'converter',
      'reports',
      'storage',
    ])
    expect(puedeVerTomaMuestras(cromatografia)).toBe(true)
    expect(puedeVerReporte(cromatografia, 'laboratorio')).toBe(true)
    expect(puedeVerReporte(cromatografia, 'emitir')).toBe(true)
    expect(puedeVerReporte(cromatografia, 'postventa')).toBe(false)
  })

  it('respeta una selección manual de módulos y secciones de Report', () => {
    const personalizado: Usuario = {
      ...cromatografia,
      modulos: ['storage', 'reports'],
      reportes: ['emitir'],
    }

    expect(modulosPermitidos(personalizado).map((modulo) => modulo.id)).toEqual([
      'reports',
      'storage',
    ])
    expect(puedeVerTomaMuestras(personalizado)).toBe(false)
    expect(puedeVerReporte(personalizado, 'laboratorio')).toBe(false)
    expect(puedeVerReporte(personalizado, 'emitir')).toBe(true)
    expect(puedeVerReporte(personalizado, 'postventa')).toBe(false)
  })
})
