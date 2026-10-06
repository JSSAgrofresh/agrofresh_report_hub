import { describe, expect, it } from 'vitest'
import {
  CATEGORIAS, aCambios, etiquetaCorreo, clavePlanta, coincideFiltro, coincideTexto, desdeComparacion, diffLista, filaVacia, indicadores,
  listaGeneral, plantaNueva, propuestasDeFila, proponer, resumenRevision, separarCorreos, valorMostrado,
} from './tabla'
import type { EstadoListas, FilaEstado, Propuestas } from './tabla'
import type { CambioLista } from './listasDistribucion'

function fila(parcial: Partial<FilaEstado> = {}): FilaEstado {
  return {
    sold_to: 'CLI SA', ship_to: 'PLANTA UNO', admin: ['jorge@agrofresh.com'], comercial: ['com@agrofresh.com'],
    tecnico: ['tec@agrofresh.com'], clientes: Object.fromEntries(CATEGORIAS.map((c) => [c, ['cli@x.cl']])),
    copia_mal: { admin: [], comercial: [], tecnico: [] }, en_listados: true, sin_contactos: false, ...parcial,
  }
}
const estado = (filas: FilaEstado[], extra: Partial<EstadoListas['resumen']> = {}): EstadoListas => ({
  filas, clientes: [], resumen: { plantas_con_lista: filas.length, plantas_listados: filas.length, listados_sin_lista: 0, ...extra },
})
const K = clavePlanta('CLI SA', 'PLANTA UNO')

describe('correos', () => {
  it('acorta solo los correos del equipo AgroFresh', () => {
    expect(etiquetaCorreo('Jorge.Sandoval@agrofresh.com')).toBe('Jorge.Sandoval')
    expect(etiquetaCorreo('agrofreshreporthub@gmail.com')).toBe('agrofreshreporthub@gmail.com')
  })

  it('separa por ; , espacios y saltos, en minúscula y sin repetir, y avisa de lo que no es correo', () => {
    const r = separarCorreos('A@x.cl; b@x.cl,\nA@X.cl  cguerrero mailto:c@x.cl')
    expect(r.validos).toEqual(['a@x.cl', 'b@x.cl', 'c@x.cl'])
    expect(r.invalidos).toEqual(['cguerrero'])
  })
  it('compara listas sin importar orden ni mayúsculas', () => {
    expect(diffLista(['a@x.cl', 'B@x.cl'], ['b@x.cl', 'c@x.cl'])).toEqual({ agregar: ['c@x.cl'], quitar: ['a@x.cl'] })
  })
})

describe('propuestas sobre celdas', () => {
  it('una propuesta que deja la celda igual desaparece', () => {
    const f = fila()
    let p: Propuestas = proponer({}, f, 'tecnico', ['tec@agrofresh.com', 'otro@agrofresh.com'], 'manual', 'aceptada')
    expect(valorMostrado(f, 'tecnico', p)).toEqual(['tec@agrofresh.com', 'otro@agrofresh.com'])
    p = proponer(p, f, 'tecnico', ['TEC@agrofresh.com'], 'manual', 'aceptada')
    expect(Object.keys(p)).toHaveLength(0)
  })

  it('el Excel con una celda vacía no propone quitar a nadie', () => {
    const f = fila()
    const excel = { ...filaVacia('CLI SA', 'PLANTA UNO'), tecnico: ['nuevo@agrofresh.com'] }
    const props = propuestasDeFila(excel, f)
    expect(props.map((p) => p.campo)).toEqual(['tecnico'])
    expect(props[0].nuevo).toEqual(['nuevo@agrofresh.com']) // y el técnico anterior se va: la celda manda
  })

  it('convierte la comparación del servidor en celdas amarillas, ajustes de copia y plantas nuevas', () => {
    const f = fila({ copia_mal: { admin: [], comercial: [], tecnico: ['tec@agrofresh.com'] } })
    const planta = { sold_to: 'CLI SA', ship_to: 'PLANTA UNO' }
    const cambios: CambioLista[] = [
      { id: '1', tipo: 'campo', planta, campo: 'comercial', etiqueta: '', agregar: ['b@agrofresh.com'], quitar: ['com@agrofresh.com'], corregir: [], aviso: null, fila: null },
      { id: '2', tipo: 'copia', planta, campo: 'copia', etiqueta: '', agregar: [], quitar: [], corregir: ['tec@agrofresh.com'], aviso: null, fila: null },
      { id: '3', tipo: 'planta_nueva', planta: { sold_to: 'N', ship_to: 'P' }, campo: 'planta', etiqueta: '', agregar: [], quitar: [], corregir: [],
        aviso: 'No existe en Listados', sugerencias: [{ sold_to: 'N', ship_to: 'P2' }], fila: filaVacia('N', 'P') },
    ]
    const r = desdeComparacion(estado([f]), { cambios, resumen: {} as never })
    expect(r.propuestas[`${K}|comercial`]).toMatchObject({ nuevo: ['b@agrofresh.com'], estado: 'pendiente', origen: 'excel' })
    expect(r.propuestas[`${K}|tecnico`]).toMatchObject({ nuevo: ['tec@agrofresh.com'], ajustarCopia: ['tec@agrofresh.com'] })
    expect(r.nuevas).toHaveLength(1)
    expect(r.nuevas[0]).toMatchObject({ existeEnListados: false, crearEnListados: true })
  })
})

describe('aceptar y guardar', () => {
  it('solo viajan al servidor las propuestas aceptadas, con lo que se agrega y se quita', () => {
    const f = fila()
    let p = proponer({}, f, 'comercial', ['otro@agrofresh.com'], 'excel', 'pendiente')
    p = proponer(p, f, 'tecnico', ['tec@agrofresh.com', 'x@agrofresh.com'], 'manual', 'aceptada')
    const e = estado([f])
    expect(resumenRevision(p, [], e)).toEqual({ pendientes: 1, aceptadas: 1, agregan: 1, quitan: 0, ajustes: 0 })
    const cambios = aCambios(e, p, [])
    expect(cambios).toHaveLength(1)
    expect(cambios[0]).toMatchObject({ tipo: 'campo', campo: 'tecnico', agregar: ['x@agrofresh.com'], quitar: [], planta: { sold_to: 'CLI SA', ship_to: 'PLANTA UNO' } })
  })

  it('un ajuste de copia aceptado viaja como cambio de tipo copia', () => {
    const f = fila({ copia_mal: { admin: [], comercial: [], tecnico: ['tec@agrofresh.com'] } })
    const p = proponer({}, f, 'tecnico', ['tec@agrofresh.com'], 'excel', 'aceptada', ['tec@agrofresh.com'])
    expect(aCambios(estado([f]), p, []).map((c) => [c.tipo, c.corregir])).toEqual([['copia', ['tec@agrofresh.com']]])
  })

  it('una planta nueva aceptada pide crearse en Listados si no existe', () => {
    const n = plantaNueva({ ...filaVacia('N', 'P'), comercial: ['c@agrofresh.com'], codigo_ship: '123' }, 'manual', 'aceptada', false)
    const cambios = aCambios(estado([]), {}, [n])
    expect(cambios[0]).toMatchObject({ tipo: 'planta_nueva', crear_en_listados: true, planta: { sold_to: 'N', ship_to: 'P' } })
    expect(cambios[0].fila?.codigo_ship).toBe('123')
    expect(aCambios(estado([]), {}, [{ ...n, estado: 'pendiente' }])).toEqual([])
  })
})

describe('plantas que el Excel ya no trae', () => {
  const comparacion = { cambios: [], resumen: {} as never, retiradas: [{ planta: { sold_to: 'OTRO SA', ship_to: 'PLANTA DOS' } }] }

  it('se ofrecen desmarcadas: importar solo no quita nada', () => {
    const { retiradas } = desdeComparacion(estado([fila()]), comparacion)
    expect(retiradas).toEqual([{ id: clavePlanta('OTRO SA', 'PLANTA DOS'), sold_to: 'OTRO SA', ship_to: 'PLANTA DOS', quitar: false }])
    expect(aCambios(estado([fila()]), {}, [], retiradas)).toEqual([])
    expect(desdeComparacion(estado([fila()]), { cambios: [], resumen: {} as never }).retiradas).toEqual([])
  })

  it('solo las marcadas viajan al servidor y cuentan como cambio aceptado', () => {
    const e = estado([fila()])
    const [r] = desdeComparacion(e, comparacion).retiradas
    const cambios = aCambios(e, {}, [], [{ ...r, quitar: true }])
    expect(cambios).toHaveLength(1)
    expect(cambios[0]).toMatchObject({ tipo: 'planta_quitar', planta: { sold_to: 'OTRO SA', ship_to: 'PLANTA DOS' } })
    expect(resumenRevision({}, [], e, [{ ...r, quitar: true }]).aceptadas).toBe(1)
    expect(resumenRevision({}, [], e, [r]).aceptadas).toBe(0)
  })
})

describe('indicadores y filtros', () => {
  const buena = fila()
  const sinTec = fila({ ship_to: 'DOS', tecnico: [] })
  const sinCli = fila({ ship_to: 'TRES', clientes: Object.fromEntries(CATEGORIAS.map((c) => [c, []])), en_listados: false })
  const vacia = fila({ ship_to: 'CUATRO', admin: [], comercial: [], tecnico: [], sin_contactos: true, clientes: Object.fromEntries(CATEGORIAS.map((c) => [c, []])) })

  it('cuenta la cobertura solo entre plantas con lista y las alertas con su criterio', () => {
    const ind = indicadores(estado([buena, sinTec, sinCli, vacia], { listados_sin_lista: 1 }))
    expect(ind).toMatchObject({ plantas: 3, conCliente: 2, conTecnico: 2, conComercial: 3 })
    expect(ind.alertas).toMatchObject({ sin_tecnico: 1, sin_cliente: 1, fuera_listados: 1, sin_lista_listados: 1 })
  })

  it('el filtro «con cambios» usa las plantas con propuestas', () => {
    const con = new Set([clavePlanta('CLI SA', 'DOS')])
    expect(coincideFiltro(sinTec, 'cambios', con)).toBe(true)
    expect(coincideFiltro(buena, 'cambios', con)).toBe(false)
  })

  it('busca sin tildes, también en lo propuesto', () => {
    const p = proponer({}, buena, 'comercial', ['nueva.persona@agrofresh.com'], 'manual', 'aceptada')
    expect(coincideTexto(buena, 'persona', p)).toBe(true)
    expect(coincideTexto(buena, 'persona', {})).toBe(false)
    expect(coincideTexto(buena, 'planta UNO cli', {})).toBe(true)
  })

  it('muestra una sola celda cuando todas las especies tienen la misma lista', () => {
    expect(listaGeneral((c) => buena.clientes[c])).toEqual(['cli@x.cl'])
    const dist = fila({ clientes: { ...buena.clientes, Kiwi: ['otro@x.cl'] } })
    expect(listaGeneral((c) => dist.clientes[c])).toBeNull()
    expect(listaGeneral((c) => sinCli.clientes[c])).toBeNull()
  })
})
