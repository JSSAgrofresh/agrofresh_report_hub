import { describe, expect, it } from 'vitest'
import { modulosPermitidos, puedeVerReporte, puedeVerSeccionLab, puedeVerTomaMuestras, seccionesLabPermitidas } from './permisos'
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
describe('Auditoría interna: solo el admin general y a quien él designe', () => {
  const ve = (u: Usuario) => modulosPermitidos(u).some((m) => m.id === 'auditoria_interna')

  it('el admin general lo ve siempre', () => {
    expect(ve({ id: '1', email: 'a@a.com', nombre: 'A', tipoAcceso: 'admin_general' })).toBe(true)
  })

  it('Gerencia NO lo ve, aunque ve el resto de los módulos', () => {
    const gerencia: Usuario = { id: '2', email: 'g@a.com', nombre: 'G', tipoAcceso: 'gerencia' }
    expect(ve(gerencia)).toBe(false)
    expect(modulosPermitidos(gerencia).length).toBeGreaterThan(3)
  })

  it('un admin de área no lo ve por defecto', () => {
    expect(ve(cromatografia)).toBe(false)
  })

  it('lo ve quien lo tenga asignado', () => {
    expect(ve({ ...cromatografia, modulos: ['reports', 'auditoria_interna'] })).toBe(true)
  })
})

describe('secciones de AgroFresh Lab por cuenta (espejo de tests/test_lab_secciones.py)', () => {
  const cuenta = (modulos?: string[]): Usuario => ({ ...cromatografia, modulos })

  it('sin secciones elegidas ve las tres, como siempre', () => {
    expect(seccionesLabPermitidas(cuenta(undefined))).toEqual(['lab_ingreso', 'lab_verificaciones', 'lab_envio'])
    expect(seccionesLabPermitidas(cuenta(['agrofresh_lab', 'toma_muestras']))).toHaveLength(3)
  })

  it('con secciones elegidas ve solo esas: se puede ocultar «Verificaciones diarias»', () => {
    const u = cuenta(['agrofresh_lab', 'lab_ingreso', 'lab_envio'])
    expect(seccionesLabPermitidas(u)).toEqual(['lab_ingreso', 'lab_envio'])
    expect(puedeVerSeccionLab(u, 'lab_verificaciones')).toBe(false)
    expect(puedeVerSeccionLab(u, 'lab_ingreso')).toBe(true)
  })

  it('las secciones no se cuelan como módulos del menú', () => {
    const u = cuenta(['agrofresh_lab', 'lab_ingreso'])
    expect(modulosPermitidos(u).map((m) => m.id)).toEqual(['agrofresh_lab'])
  })

  it('admin general y gerencia ven siempre todo', () => {
    const ag: Usuario = { id: '1', email: 'a@a.com', nombre: 'A', tipoAcceso: 'admin_general', modulos: ['lab_ingreso'] }
    const ge: Usuario = { id: '2', email: 'g@a.com', nombre: 'G', tipoAcceso: 'gerencia', modulos: ['lab_ingreso'] }
    expect(seccionesLabPermitidas(ag)).toHaveLength(3)
    expect(seccionesLabPermitidas(ge)).toHaveLength(3)
  })
})
