import { describe, expect, it } from 'vitest'
import {
  esSoloLectura,
  etiquetaAcceso,
  modulosPermitidos,
  puedeCrearReanalisis,
  puedeEditarCriteriosLab,
  puedeFirmarVerificaciones,
  puedeVerReporte,
  puedeVerSeccionLab,
  puedeVerTomaMuestras,
  seccionesLabPermitidas,
  tieneFuncion,
  vistaDeCliente,
} from './permisos'
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
describe('Panel de control interno: solo el admin general y a quien él designe', () => {
  const ve = (u: Usuario) => modulosPermitidos(u).some((m) => m.id === 'auditoria_interna')

  it('el admin general lo ve siempre', () => {
    expect(ve({ id: '1', email: 'a@a.com', nombre: 'A', tipoAcceso: 'admin_general' })).toBe(true)
  })

  it('Gerencia NO lo ve, aunque ve el resto de los módulos', () => {
    const gerencia: Usuario = { id: '2', email: 'g@a.com', nombre: 'G', tipoAcceso: 'gerencia' }
    expect(ve(gerencia)).toBe(false)
    expect(modulosPermitidos(gerencia).length).toBeGreaterThan(3)
  })

  it('Gerencia con lista ve solo los módulos marcados; sin lista (antigua) ve todos', () => {
    const base: Usuario = { id: '2', email: 'g@a.com', nombre: 'G', tipoAcceso: 'gerencia' }
    expect(modulosPermitidos({ ...base, modulos: ['reports'] }).map((m) => m.id)).toEqual(['reports'])
    expect(modulosPermitidos({ ...base, modulos: [] })).toEqual([])
    expect(modulosPermitidos({ ...base, modulos: ['auditoria_interna'] }).map((m) => m.id)).toEqual(['auditoria_interna'])
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

  it('«Modificar criterios» es un permiso aparte: no recorta las secciones', () => {
    const u = cuenta(['agrofresh_lab', 'lab_criterios'])
    expect(seccionesLabPermitidas(u)).toHaveLength(3)
    expect(puedeEditarCriteriosLab(u)).toBe(true)
    expect(puedeEditarCriteriosLab(cuenta(['agrofresh_lab']))).toBe(false)
    expect(puedeEditarCriteriosLab({ ...cromatografia, tipoAcceso: 'gerencia', modulos: ['agrofresh_lab'] })).toBe(false)
    expect(puedeEditarCriteriosLab({ ...cromatografia, tipoAcceso: 'admin_general', modulos: undefined })).toBe(true)
    expect(modulosPermitidos(u).map((m) => m.id)).toEqual(['agrofresh_lab'])
  })

  it('admin general y gerencia ven siempre todo', () => {
    const ag: Usuario = { id: '1', email: 'a@a.com', nombre: 'A', tipoAcceso: 'admin_general', modulos: ['lab_ingreso'] }
    const ge: Usuario = { id: '2', email: 'g@a.com', nombre: 'G', tipoAcceso: 'gerencia', modulos: ['lab_ingreso'] }
    expect(seccionesLabPermitidas(ag)).toHaveLength(3)
    expect(seccionesLabPermitidas(ge)).toHaveLength(3)
  })
})

describe('mini funciones asignables (espejo de test_permisos_funciones.py)', () => {
  const u = (tipoAcceso: Usuario['tipoAcceso'], modulos?: string[], area?: Usuario['area']) =>
    ({ id: '1', email: 'x@agrofresh.com', nombre: 'X', tipoAcceso, area, modulos }) as Usuario

  it('el administrador general las tiene todas; gerencia y clientes ninguna', () => {
    for (const f of ['lab_criterios', 'verif_firmar', 'toma_reanalisis'] as const) {
      expect(tieneFuncion(u('admin_general'), f)).toBe(true)
      expect(tieneFuncion(u('gerencia', ['lab_criterios', 'verif_firmar', 'toma_reanalisis']), f)).toBe(false)
      expect(tieneFuncion(u('cliente', ['lab_criterios']), f)).toBe(false)
    }
  })

  it('el resto solo tiene lo que se le marcó', () => {
    const cuenta = u('analista', ['agrofresh_lab', 'lab_criterios'])
    expect(puedeEditarCriteriosLab(cuenta)).toBe(true)
    expect(tieneFuncion(cuenta, 'verif_firmar')).toBe(false)
    expect(puedeEditarCriteriosLab(u('analista'))).toBe(false)
  })

  it('firmar: admin general, admin de Cromatografía o quien tenga la función', () => {
    expect(puedeFirmarVerificaciones(u('admin_area', undefined, 'cromatografia'))).toBe(true)
    expect(puedeFirmarVerificaciones(u('admin_area', undefined, 'ryd'))).toBe(false)
    expect(puedeFirmarVerificaciones(u('analista', ['verif_firmar']))).toBe(true)
  })

  it('el reanálisis se puede dar a una cuenta concreta (igual que en el servidor)', () => {
    expect(puedeCrearReanalisis(u('analista', ['agrofresh_lab']))).toBe(false)
    expect(puedeCrearReanalisis(u('analista', ['toma_reanalisis']))).toBe(true)
    expect(puedeCrearReanalisis(u('admin_area'))).toBe(false) // ningún tipo de cuenta la trae sola
    expect(puedeCrearReanalisis(u('admin_area', ['toma_reanalisis']))).toBe(true)
    expect(puedeCrearReanalisis(u('admin_general'))).toBe(true)
    expect(puedeCrearReanalisis(u('gerencia', ['toma_reanalisis']))).toBe(false)
  })

  it('un cliente ve lo que se le asignó; las cuentas antiguas conservan lo de su área', () => {
    expect(vistaDeCliente({ area: 'postventa', modulos: ['reports', 'storage'], reportes: ['laboratorio', 'postventa'] })).toEqual({
      report: true, storage: true, accutab: true,
    })
    expect(vistaDeCliente({ area: 'postventa' })).toEqual({ report: false, storage: false, accutab: true })
    expect(vistaDeCliente({ area: 'cromatografia' })).toEqual({ report: true, storage: false, accutab: false })
    expect(etiquetaAcceso(u('cliente') as Usuario)).toBe('Cliente · Report')
    expect(etiquetaAcceso({ ...u('cliente', ['reports', 'storage']), reportes: ['laboratorio', 'postventa'] })).toBe(
      'Cliente · Report + Storage + Accu-Tab',
    )
  })

  it('el Report de Post Venta es interno: un cliente nunca lo abre aunque tenga «postventa»', () => {
    const cliente = { ...u('cliente', ['reports']), reportes: ['laboratorio', 'postventa'] } as Usuario
    expect(puedeVerReporte(cliente, 'laboratorio')).toBe(true)
    expect(puedeVerReporte(cliente, 'postventa')).toBe(false)
  })
})

describe('cuenta de comercial', () => {
  const comercial: Usuario = {
    id: 'com', email: 'com@agrofresh.com', nombre: 'Com', tipoAcceso: 'comercial',
    modulos: ['reports', 'storage', 'converter', 'auditoria_interna'], reportes: ['laboratorio', 'postventa'],
    plantasAsignadas: [{ clienteNombre: 'DOLE', plantaNombre: 'DOLE LONTUE' }],
  }

  it('solo abre Report y Storage, aunque la lista guardada traiga más', () => {
    expect(modulosPermitidos(comercial).map((m) => m.id).sort()).toEqual(['reports', 'storage'])
    expect(modulosPermitidos({ ...comercial, modulos: ['storage'] }).map((m) => m.id)).toEqual(['storage'])
    expect(modulosPermitidos({ ...comercial, modulos: undefined })).toEqual([])
  })

  it('es de solo lectura, sin funciones sueltas ni Report de Post Venta', () => {
    expect(esSoloLectura(comercial)).toBe(true)
    expect(tieneFuncion({ ...comercial, modulos: ['toma_reanalisis'] }, 'toma_reanalisis')).toBe(false)
    expect(puedeVerReporte(comercial, 'laboratorio')).toBe(true)
    expect(puedeVerReporte(comercial, 'postventa')).toBe(false)
    expect(puedeVerTomaMuestras(comercial)).toBe(false)
    expect(etiquetaAcceso(comercial)).toBe('Comercial')
  })
})
