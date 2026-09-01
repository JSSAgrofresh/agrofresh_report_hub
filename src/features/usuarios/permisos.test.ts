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
    // AgroFresh Lab entra acá porque es quien recibe las muestras y emite los
    // informes: era la sección "Emitir" dentro de Report y pasó a ser un
    // módulo propio.
    expect(modulosPermitidos(cromatografia).map((modulo) => modulo.id)).toEqual([
      'converter',
      'reports',
      'agrofresh_lab',
      'storage',
    ])
    expect(puedeVerTomaMuestras(cromatografia)).toBe(true)
    expect(puedeVerReporte(cromatografia, 'laboratorio')).toBe(true)
    expect(puedeVerReporte(cromatografia, 'postventa')).toBe(false)
  })

  it('respeta una selección manual de módulos y secciones de Report', () => {
    const personalizado: Usuario = {
      ...cromatografia,
      modulos: ['storage', 'reports'],
      reportes: ['postventa'],
    }

    expect(modulosPermitidos(personalizado).map((modulo) => modulo.id)).toEqual([
      'reports',
      'storage',
    ])
    expect(puedeVerTomaMuestras(personalizado)).toBe(false)
    expect(puedeVerReporte(personalizado, 'laboratorio')).toBe(false)
    expect(puedeVerReporte(personalizado, 'postventa')).toBe(true)
  })

  it('una selección manual puede dejar fuera AgroFresh Lab', () => {
    /* Ser admin de un área no obliga a recibir muestras: quien solo mira
     * reportes no tiene por qué entrar al laboratorio. */
    const soloReportes: Usuario = { ...cromatografia, modulos: ['reports'] }
    expect(modulosPermitidos(soloReportes).map((m) => m.id)).toEqual(['reports'])
  })
})