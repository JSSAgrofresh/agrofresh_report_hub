import { describe, expect, it } from 'vitest'
import type { Observacion } from './tipos'
import {
  FILTROS_VACIOS,
  aplicarFiltros,
  claveFiltro,
  clientesDeSucursal,
  contarFiltrosActivos,
  opcionesDe,
} from './filtros'

let siguienteId = 1
function obs(parcial: Partial<Observacion>): Observacion {
  const id = parcial.solicitudId ?? siguienteId++
  return {
    solicitudId: id,
    nroSolicitud: `S-${id}`,
    ingrediente: 'DPA',
    ppm: 1,
    valorTexto: null,
    fecha: '2026-01-10',
    cliente: null,
    planta: null,
    tipoAplicacion: null,
    tipoServicio: null,
    posicionMuestreo: null,
    laboratorio: 'Agrofresh',
    crop: null,
    variedad: null,
    semana: 2,
    mes: 1,
    ...parcial,
  }
}

const DATOS: Observacion[] = [
  obs({ solicitudId: 1, cliente: 'A.G. SERVICIOS SPA', planta: 'Planta Rancagua', crop: 'Cereza', variedad: 'Lapins' }),
  obs({ solicitudId: 1, cliente: 'A.G. SERVICIOS SPA', planta: 'Planta Rancagua', crop: 'Cereza', variedad: 'Lapins', ingrediente: 'FDL' }),
  // Mismo cliente escrito distinto (texto crudo sin planta resuelta).
  obs({ solicitudId: 2, cliente: 'AG Servicios SpA', planta: null, crop: 'CEREZA', variedad: 'lapins' }),
  obs({ solicitudId: 3, cliente: 'Dole Chile S.A.', planta: 'Codegua', crop: 'Arandano', variedad: 'Duke' }),
  obs({ solicitudId: 4, cliente: 'Dole Chile S.A.', planta: 'Codegua', crop: 'Manzana', variedad: 'June Gold' }),
  obs({ solicitudId: 5, cliente: 'Frutícola Sur', planta: 'Planta Rancagua', crop: 'Durazno', variedad: 'June Gold' }),
]

describe('claveFiltro', () => {
  it('ignora mayúsculas, tildes, puntuación y espacios de más', () => {
    expect(claveFiltro('A.G. SERVICIOS  SPA')).toBe(claveFiltro('ag servicios spa'))
    expect(claveFiltro(' Arándano ')).toBe(claveFiltro('ARANDANO'))
  })

  it('no junta nombres que de verdad son distintos', () => {
    expect(claveFiltro('Thompson')).not.toBe(claveFiltro('Thompson Seedless'))
  })
})

describe('filtro Sold To / Ship To', () => {
  it('el Sold To trae también las filas escritas distinto', () => {
    const r = aplicarFiltros(DATOS, { ...FILTROS_VACIOS, cliente: 'A.G. SERVICIOS SPA' })
    expect(new Set(r.map((o) => o.solicitudId))).toEqual(new Set([1, 2]))
  })

  it('las variantes de un mismo Sold To son una sola opción, con sus solicitudes', () => {
    const ops = opcionesDe(aplicarFiltros(DATOS, FILTROS_VACIOS, 'cliente'), 'cliente')
    const ag = ops.filter((o) => claveFiltro(o.valor) === claveFiltro('AG SERVICIOS SPA'))
    expect(ag).toHaveLength(1)
    expect(ag[0].conteo).toBe(2)
  })

  it('Ship To en cascada: con un Sold To elegido solo salen sus sucursales', () => {
    const f = { ...FILTROS_VACIOS, cliente: 'Dole Chile S.A.' }
    const ops = opcionesDe(aplicarFiltros(DATOS, f, 'planta'), 'planta')
    expect(ops.map((o) => o.valor)).toEqual(['Codegua'])
  })

  it('una sucursal con el mismo nombre en dos clientes no se mezcla al elegir el cliente', () => {
    const f = { ...FILTROS_VACIOS, cliente: 'Frutícola Sur', planta: 'Planta Rancagua' }
    expect(aplicarFiltros(DATOS, f).map((o) => o.solicitudId)).toEqual([5])
  })

  it('clientesDeSucursal: dice a qué clientes pertenece una sucursal', () => {
    expect(clientesDeSucursal(DATOS, 'Codegua')).toEqual(['Dole Chile S.A.'])
    expect(clientesDeSucursal(DATOS, 'planta rancagua').sort()).toEqual(['A.G. SERVICIOS SPA', 'Frutícola Sur'])
  })
})

describe('filtro Especie / Variedad', () => {
  it('Especie ofrece solo lo que tiene el cliente elegido, con el nombre oficial', () => {
    const f = { ...FILTROS_VACIOS, cliente: 'Dole Chile S.A.' }
    const ops = opcionesDe(aplicarFiltros(DATOS, f, 'crop'), 'crop', { canonicos: ['Arándano', 'Cereza', 'Manzana'] })
    expect(ops).toEqual([
      { valor: 'Arándano', conteo: 1 },
      { valor: 'Manzana', conteo: 1 },
    ])
  })

  it('elegir la especie oficial con tilde encuentra los datos cargados sin tilde', () => {
    const r = aplicarFiltros(DATOS, { ...FILTROS_VACIOS, crop: 'Arándano' })
    expect(r.map((o) => o.solicitudId)).toEqual([3])
  })

  it('Variedad en cascada: "June Gold" de Manzana no trae la de Durazno', () => {
    const f = { ...FILTROS_VACIOS, crop: 'Manzana', variedad: 'June Gold' }
    expect(aplicarFiltros(DATOS, f).map((o) => o.solicitudId)).toEqual([4])
    const ops = opcionesDe(aplicarFiltros(DATOS, { ...FILTROS_VACIOS, crop: 'Durazno' }, 'variedad'), 'variedad')
    expect(ops).toEqual([{ valor: 'June Gold', conteo: 1 }])
  })

  it('una opción elegida sigue en la lista aunque los otros filtros la dejen en 0', () => {
    const f = { ...FILTROS_VACIOS, cliente: 'Dole Chile S.A.', crop: 'Cereza' }
    const ops = opcionesDe(aplicarFiltros(DATOS, f, 'crop'), 'crop', { seleccionados: [f.crop] })
    expect(ops).toContainEqual({ valor: 'Cereza', conteo: 0 })
  })

  it('las variantes de mayúsculas de una variedad son una sola opción', () => {
    const f = { ...FILTROS_VACIOS, crop: 'Cereza' }
    const ops = opcionesDe(aplicarFiltros(DATOS, f, 'variedad'), 'variedad', { canonicos: ['Lapins'] })
    expect(ops).toEqual([{ valor: 'Lapins', conteo: 2 }])
  })
})

describe('contarFiltrosActivos', () => {
  it('cuenta cada filtro puesto una vez', () => {
    expect(contarFiltrosActivos(FILTROS_VACIOS)).toBe(0)
    expect(
      contarFiltrosActivos({ ...FILTROS_VACIOS, cliente: 'x', ingredientes: ['A', 'B'], rango: { desde: '1', hasta: '2' } }),
    ).toBe(3)
  })
})
