import { describe, expect, it } from 'vitest'
import { claveFiltrosGuardados, leerFiltros } from '@/features/tomaMuestras/lib/filtrosSolicitudes'
import { dejarFiltrosPendientes, filtrosPendientesDeInforme } from './irAPendientes'

function almacenFalso() {
  const datos = new Map<string, string>()
  return {
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => void datos.set(k, v),
    removeItem: (k: string) => void datos.delete(k),
  }
}

describe('filtrosPendientesDeInforme', () => {
  it('filtra por laboratorio y por «Sin informe»', () => {
    const f = filtrosPendientesDeInforme('QUITECA')
    expect(f.laboratorio).toEqual(['QUITECA'])
    expect(f.estado).toEqual(['sin_informe'])
  })
  it('sin laboratorio solo pide «Sin informe»', () => {
    expect(filtrosPendientesDeInforme().laboratorio).toEqual([])
  })
})

describe('dejarFiltrosPendientes', () => {
  it('Solicitudes e informes los recupera al abrirse', () => {
    const almacen = almacenFalso()
    dejarFiltrosPendientes('Paz@AgroFresh.com', 'ALS', almacen, 1000)
    const f = leerFiltros(almacen, claveFiltrosGuardados('paz@agrofresh.com'), 2000)
    expect(f.laboratorio).toEqual(['ALS'])
    expect(f.estado).toEqual(['sin_informe'])
  })
})
