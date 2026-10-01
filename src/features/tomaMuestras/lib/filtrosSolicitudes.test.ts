import { describe, expect, it } from 'vitest'
import { FILTROS_VACIOS, filtrarSolicitudes, hayFiltros, opcionesDe } from './filtrosSolicitudes'
import type { FiltrosSolicitudes } from './filtrosSolicitudes'
import type { Solicitud } from './tipos'

function sol(n: string, extra: Partial<Solicitud> = {}): Solicitud {
  return {
    numero_solicitud: n,
    fecha_solicitud: '2026-09-30',
    laboratorio: 'QUITECA',
    sold_to: 'DOLE CHILE S.A.',
    ship_to: 'DOLE PLANTA CODEGUA',
    especie: 'Manzana',
    variedad: 'Gala',
    solicitante: 'X',
    generado_por: 'g',
    tipo_muestra: 'Fruta',
    nombre_muestreador: 'Ana',
    linea_proceso: null,
    campos_laboratorio: { 'Tipo Aplicación': 'Actimist' },
    enviada: false,
    sin_lista_distribucion: false,
    es_prueba: false,
    ...extra,
  } as Solicitud
}

const f = (extra: Partial<FiltrosSolicitudes>): FiltrosSolicitudes => ({ ...FILTROS_VACIOS, ...extra })
const numeros = (l: Solicitud[]) => l.map((s) => s.numero_solicitud)

const DATOS = [
  sol('A', { laboratorio: 'QUITECA', especie: 'Manzana' }),
  sol('B', { laboratorio: 'ALS', especie: 'Naranja', sold_to: 'MULTIFRUTA SA', ship_to: 'GESEX PLANTA FATIMA' }),
  sol('C', { laboratorio: 'DIAGNOFRUIT', especie: 'Palta', campos_laboratorio: { 'Tipo Aplicación': 'Línea de proceso' } }),
  sol('D', { laboratorio: 'QUITECA', especie: 'Palta', enviada: true, sin_lista_distribucion: true }),
]

describe('filtros de solicitudes con varias opciones', () => {
  it('sin nada marcado no filtra', () => {
    expect(filtrarSolicitudes(DATOS, FILTROS_VACIOS)).toHaveLength(4)
    expect(hayFiltros(FILTROS_VACIOS)).toBe(false)
  })

  it('dentro de un filtro vale cualquiera de los marcados', () => {
    expect(numeros(filtrarSolicitudes(DATOS, f({ laboratorio: ['QUITECA', 'ALS'] })))).toEqual(['A', 'B', 'D'])
    expect(numeros(filtrarSolicitudes(DATOS, f({ especie: ['Naranja', 'Palta'] })))).toEqual(['B', 'C', 'D'])
  })

  it('entre filtros distintos tienen que cumplirse todos', () => {
    const r = filtrarSolicitudes(DATOS, f({ laboratorio: ['QUITECA', 'ALS'], especie: ['Palta', 'Naranja'] }))
    expect(numeros(r)).toEqual(['B', 'D'])
  })

  it('tipo de aplicación y Sold To también aceptan varios', () => {
    expect(numeros(filtrarSolicitudes(DATOS, f({ tipoAplicacion: ['Línea de proceso'] })))).toEqual(['C'])
    expect(numeros(filtrarSolicitudes(DATOS, f({ soldTo: ['MULTIFRUTA SA', 'DOLE CHILE S.A.'] })))).toHaveLength(4)
  })

  it('Estado: Enviada y Pendiente son alternativas; Sin lista se suma como condición', () => {
    expect(numeros(filtrarSolicitudes(DATOS, f({ estado: ['enviada'] })))).toEqual(['D'])
    expect(numeros(filtrarSolicitudes(DATOS, f({ estado: ['pendiente'] })))).toEqual(['A', 'B', 'C'])
    expect(numeros(filtrarSolicitudes(DATOS, f({ estado: ['enviada', 'pendiente'] })))).toHaveLength(4)
    expect(numeros(filtrarSolicitudes(DATOS, f({ estado: ['sin_lista'] })))).toEqual(['D'])
    // Pendiente + Sin lista: las pendientes que van a Jorge y Claudia (ninguna acá).
    expect(filtrarSolicitudes(DATOS, f({ estado: ['pendiente', 'sin_lista'] }))).toHaveLength(0)
    expect(numeros(filtrarSolicitudes(DATOS, f({ estado: ['enviada', 'sin_lista'] })))).toEqual(['D'])
  })

  it('los filtros de texto siguen funcionando junto a las listas', () => {
    expect(numeros(filtrarSolicitudes(DATOS, f({ variedad: 'gal', laboratorio: ['ALS'] })))).toEqual(['B'])
    expect(numeros(filtrarSolicitudes(DATOS, f({ busqueda: 'multifruta' })))).toEqual(['B'])
    expect(numeros(filtrarSolicitudes(DATOS, f({ fechaDesde: '2026-10-01' })))).toEqual([])
  })

  it('Ship To ofrece solo las plantas de los clientes marcados', () => {
    expect(opcionesDe(DATOS, FILTROS_VACIOS).shipTo).toEqual(['DOLE PLANTA CODEGUA', 'GESEX PLANTA FATIMA'])
    expect(opcionesDe(DATOS, f({ soldTo: ['MULTIFRUTA SA'] })).shipTo).toEqual(['GESEX PLANTA FATIMA'])
    // Un Ship To ya marcado sigue ofrecido para poder desmarcarlo.
    expect(
      opcionesDe(DATOS, f({ soldTo: ['MULTIFRUTA SA'], shipTo: ['DOLE PLANTA CODEGUA'] })).shipTo,
    ).toEqual(['DOLE PLANTA CODEGUA', 'GESEX PLANTA FATIMA'])
  })

  it('hayFiltros detecta listas marcadas', () => {
    expect(hayFiltros(f({ laboratorio: ['ALS'] }))).toBe(true)
    expect(hayFiltros(f({ estado: ['sin_lista'] }))).toBe(true)
    expect(hayFiltros(f({ solicitante: '  ' }))).toBe(false)
  })
})
