import { describe, expect, it } from 'vitest'
import {
  NOMBRE_BLOQUE, alTocarBoton, bloqueDeLaboratorio, bloquesVisibles, estadoBotonesResidual, labResidual, nombreLaboratorio,
} from './bloquesAnalisis'

describe('nombreLaboratorio', () => {
  it('cada laboratorio con su nombre completo, como llegue escrito', () => {
    expect(nombreLaboratorio('Agrofresh')).toBe('Laboratorio AgroFresh')
    expect(nombreLaboratorio('AGROFRESH')).toBe('Laboratorio AgroFresh')
    expect(nombreLaboratorio('Quiteca')).toBe('Laboratorio Quiteca')
    expect(nombreLaboratorio('ALS (Corthon)')).toBe('Laboratorio ALS Global')
    expect(nombreLaboratorio('Als')).toBe('Laboratorio ALS Global')
    expect(nombreLaboratorio('Diagnofruit')).toBe('Laboratorio Diagnofruit')
  })

  it('un laboratorio que no conoce queda como está, y vacío da vacío', () => {
    expect(nombreLaboratorio('Otro Lab')).toBe('Otro Lab')
    expect(nombreLaboratorio(null)).toBe('')
    expect(nombreLaboratorio('')).toBe('')
  })
})

describe('bloques', () => {
  it('los nombres de los análisis', () => {
    expect(NOMBRE_BLOQUE).toEqual({ residuales: 'Análisis de residuos', fsma: 'Análisis FSMA', fito: 'Análisis de fitopatología' })
  })

  it('cada laboratorio es de su bloque; uno desconocido cae en residuos', () => {
    expect(bloqueDeLaboratorio('Agrofresh')).toBe('residuales')
    expect(bloqueDeLaboratorio('Quiteca')).toBe('residuales')
    expect(bloqueDeLaboratorio('ALS (Corthon)')).toBe('fsma')
    expect(bloqueDeLaboratorio('Diagnofruit')).toBe('fito')
    expect(bloqueDeLaboratorio('Otro')).toBe('residuales')
  })

  it('sin laboratorio elegido se ven los tres; eligiendo uno, solo el suyo', () => {
    expect(bloquesVisibles('')).toEqual({ residuales: true, fsma: true, fito: true })
    expect(bloquesVisibles(undefined)).toEqual({ residuales: true, fsma: true, fito: true })
    expect(bloquesVisibles('Agrofresh')).toEqual({ residuales: true, fsma: false, fito: false })
    expect(bloquesVisibles('ALS (Corthon)')).toEqual({ residuales: false, fsma: true, fito: false })
    expect(bloquesVisibles('Diagnofruit')).toEqual({ residuales: false, fsma: false, fito: true })
  })
})

describe('botones de laboratorio del bloque de residuos', () => {
  it('reconoce los dos laboratorios de residuos y nada más', () => {
    expect(labResidual('Agrofresh')).toBe('agrofresh')
    expect(labResidual('QUITECA')).toBe('quiteca')
    expect(labResidual('Als')).toBe('')
    expect(labResidual('')).toBe('')
  })

  it('con el filtro de arriba fijado a un laboratorio, ese manda sobre lo tocado en el bloque', () => {
    expect(estadoBotonesResidual('Agrofresh', '')).toEqual({ efectivo: 'agrofresh', fijadoPorFiltro: true })
    expect(estadoBotonesResidual('Agrofresh', 'quiteca')).toEqual({ efectivo: 'agrofresh', fijadoPorFiltro: true })
    expect(estadoBotonesResidual('', 'quiteca')).toEqual({ efectivo: 'quiteca', fijadoPorFiltro: false })
    expect(estadoBotonesResidual('', '')).toEqual({ efectivo: '', fijadoPorFiltro: false })
  })

  it('sin filtro, tocar un botón lo elige, tocarlo otra vez lo suelta y tocar el otro cambia', () => {
    expect(alTocarBoton('agrofresh', '', '')).toEqual({ botonElegido: 'agrofresh', quitarFiltroLaboratorio: false })
    expect(alTocarBoton('agrofresh', '', 'agrofresh')).toEqual({ botonElegido: '', quitarFiltroLaboratorio: false })
    expect(alTocarBoton('quiteca', '', 'agrofresh')).toEqual({ botonElegido: 'quiteca', quitarFiltroLaboratorio: false })
  })

  it('con AgroFresh fijado arriba, tocar Quiteca quita el filtro de laboratorio y deja elegido Quiteca', () => {
    expect(alTocarBoton('quiteca', 'Agrofresh', '')).toEqual({ botonElegido: 'quiteca', quitarFiltroLaboratorio: true })
  })

  it('con AgroFresh fijado arriba, tocar AgroFresh quita el filtro y deja los dos', () => {
    expect(alTocarBoton('agrofresh', 'Agrofresh', '')).toEqual({ botonElegido: '', quitarFiltroLaboratorio: true })
  })
})
