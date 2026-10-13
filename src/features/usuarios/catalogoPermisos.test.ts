import { describe, expect, it } from 'vitest'
import {
  CATEGORIAS,
  IDS_PERMISOS,
  RESERVADOS,
  alternarPermiso,
  cuentaDesdeSeleccion,
  marcarCategoria,
  seleccionDesdeCuenta,
  seleccionTotal,
  validarSeleccion,
} from './catalogoPermisos'
import { MODULOS } from '@/constants/modules'
import { modulosPredeterminados, reportesPredeterminados } from './permisos'

describe('catálogo de permisos', () => {
  it('trae TODOS los módulos del sistema, cada uno una sola vez', () => {
    for (const m of MODULOS) expect(IDS_PERMISOS).toContain(m.id)
    expect(IDS_PERMISOS).toContain('toma_muestras')
    expect(new Set(IDS_PERMISOS).size).toBe(IDS_PERMISOS.length)
  })

  it('agrupa por categoría y deja Data Core con sus tres herramientas', () => {
    const datacore = CATEGORIAS.find((c) => c.id === 'datacore')!
    expect(datacore.permisos.map((p) => p.id)).toEqual(['ingesta', 'trace', 'converter'])
  })

  it('las funciones que son solo del administrador general no se pueden repartir', () => {
    expect(RESERVADOS.map((r) => r.nombre)).toEqual(
      expect.arrayContaining(['Usuarios y permisos', 'Administración General', 'Listados']),
    )
    for (const r of RESERVADOS) expect(IDS_PERMISOS).not.toContain(r.nombre)
    for (const id of IDS_PERMISOS) expect(['usuarios', 'listados', 'laboratorios', 'administracion_general']).not.toContain(id)
  })

  it('los criterios de las verificaciones son una función suelta que se puede asignar', () => {
    const criterios = CATEGORIAS.flatMap((c) => c.permisos).find((p) => p.id === 'lab_criterios')!
    expect(criterios.padre).toBe('lab_verificaciones')
    expect(criterios.extra).toBe(true)
  })
})

describe('marcar y desmarcar respetando la jerarquía', () => {
  it('al marcar un módulo se dan sus secciones normales, no las funciones sueltas', () => {
    const sel = alternarPermiso([], 'agrofresh_lab')
    expect(sel).toEqual(expect.arrayContaining(['agrofresh_lab', 'lab_ingreso', 'lab_verificaciones', 'lab_envio']))
    expect(sel).not.toContain('lab_criterios')
    expect(sel).not.toContain('verif_firmar')
  })

  it('marcar una función suelta marca también a sus padres', () => {
    expect(alternarPermiso([], 'lab_criterios')).toEqual(['agrofresh_lab', 'lab_verificaciones', 'lab_criterios'])
  })

  it('quitar una sección quita sus funciones; quitar el módulo quita todo lo de adentro', () => {
    const todo = marcarCategoria([], 'lab', true)
    expect(todo).toContain('lab_criterios')
    expect(alternarPermiso(todo, 'lab_verificaciones')).not.toContain('lab_criterios')
    expect(alternarPermiso(todo, 'agrofresh_lab')).toEqual([])
  })

  it('«Marcar todo» y «Quitar todo» de una categoría no tocan a las demás', () => {
    const sel = marcarCategoria(['storage'], 'datacore', true)
    expect(sel).toEqual(expect.arrayContaining(['ingesta', 'trace', 'converter', 'storage']))
    expect(marcarCategoria(sel, 'datacore', false)).toEqual(['storage'])
  })
})

describe('de la cuenta al selector y de vuelta', () => {
  const base = (tipoAcceso: 'admin_area', area: 'cromatografia') => ({ tipoAcceso, area })

  it('una cuenta sin lista propia parte con lo típico de su tipo', () => {
    const b = base('admin_area', 'cromatografia')
    const sel = seleccionDesdeCuenta({ ...b }, modulosPredeterminados(b), reportesPredeterminados(b))
    expect(sel).toEqual(expect.arrayContaining(['converter', 'reports', 'reporte:laboratorio', 'agrofresh_lab', 'lab_ingreso', 'toma_muestras']))
    expect(sel).not.toContain('reporte:postventa')
  })

  it('con las tres puertas de AgroFresh Lab no guarda ninguna; si falta una, guarda las elegidas', () => {
    const todas = ['agrofresh_lab', 'lab_ingreso', 'lab_verificaciones', 'lab_envio']
    expect(cuentaDesdeSeleccion(todas).modulos).toEqual(['agrofresh_lab'])
    expect(cuentaDesdeSeleccion(['agrofresh_lab', 'lab_ingreso', 'lab_envio']).modulos).toEqual(['agrofresh_lab', 'lab_ingreso', 'lab_envio'])
  })

  it('guarda las funciones sueltas en `modulos` y las secciones de Report en `reportes`', () => {
    const r = cuentaDesdeSeleccion(['reports', 'reporte:postventa', 'agrofresh_lab', 'lab_ingreso', 'lab_verificaciones', 'lab_envio', 'lab_criterios'])
    expect(r.modulos).toEqual(['reports', 'agrofresh_lab', 'lab_criterios'])
    expect(r.reportes).toEqual(['postventa'])
  })

  it('una cuenta que ya tiene funciones sueltas las conserva al reabrirla', () => {
    const sel = seleccionDesdeCuenta(
      { tipoAcceso: 'analista', area: 'cromatografia', modulos: ['agrofresh_lab', 'lab_criterios'] },
      [],
      [],
    )
    expect(sel).toContain('lab_criterios')
    expect(sel).toContain('lab_ingreso') // ninguna puerta elegida = las tres
  })

  it('no deja guardar Report sin ninguna sección ni AgroFresh Lab sin ninguna puerta', () => {
    expect(validarSeleccion(['reports'])).toMatch(/sección de Report/)
    expect(validarSeleccion(['agrofresh_lab'])).toMatch(/sección de AgroFresh Lab/)
    expect(validarSeleccion(['reports', 'reporte:laboratorio'])).toBeNull()
  })

  it('administrador general lo ve todo; gerencia, sin Auditoría interna ni funciones de escritura', () => {
    expect(seleccionTotal('admin_general')).toEqual(IDS_PERMISOS)
    const g = seleccionTotal('gerencia')
    expect(g).not.toContain('auditoria_interna')
    expect(g).not.toContain('lab_criterios')
    expect(g).toContain('storage')
  })
})
