import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { SolicitudAuditoria } from '@/features/auditoriaInterna'

vi.mock('@/features/catalogo', () => ({
  listarClientes: () => Promise.resolve([
    { id: 1, nombre: 'DOLE CHILE S.A.', activo: true },
    { id: 2, nombre: 'Zeta Frutas', activo: true },
    { id: 3, nombre: 'Alfa Ltda', activo: true },
    { id: 4, nombre: 'Inactivo SA', activo: false },
  ]),
}))

import { AnalisisPorCliente } from './AnalisisPorCliente'

const sol = (lab: string, cliente: string, concretada = false) =>
  ({ archivo: Math.random().toString(), numero_solicitud: 'OT', laboratorio: lab, sold_to: cliente, ship_to: null, especie: null, variedad: null, tipo_servicio: null, analitos: [], fecha_solicitud: null, fecha_muestreo: null, emitida_en: null, informe: null, en_report: concretada, concretada }) as SolicitudAuditoria

describe('AnalisisPorCliente', () => {
  const lista = [
    sol('AGROFRESH', 'DOLE CHILE S.A.', true), sol('QUITECA', 'DOLE CHILE S.A.'), sol('ALS', 'DOLE CHILE S.A.'), sol('DIAGNOFRUIT', 'DOLE CHILE S.A.'),
    sol('QUITECA', 'MULTIFRUTA'),
  ]

  it('cada cliente tiene una fila por análisis: Residuales con AgroFresh y Quiteca en columnas (cantidad y %), FSMA y FITO', () => {
    render(<AnalisisPorCliente solicitudes={lista} />)
    const filas = screen.getAllByRole('row').slice(2)
    // DOLE: Residuales, FSMA, FITO
    expect(within(filas[0]).getByText('DOLE CHILE S.A.')).toBeTruthy()
    expect(within(filas[0]).getByText('Residuales')).toBeTruthy()
    expect(within(filas[0]).getAllByText('50%')).toHaveLength(2)
    expect(within(filas[1]).getByText('FSMA')).toBeTruthy()
    expect(within(filas[2]).getByText('FITO')).toBeTruthy()
    expect(screen.getByText('MULTIFRUTA')).toBeTruthy()
    // sin plan cargado, las columnas de entregables no aparecen
    expect(screen.queryByText('Entregables')).toBeNull()
  })

  it('los clientes del listado sin ningún análisis salen apagados al final, solo si se piden', async () => {
    render(<AnalisisPorCliente solicitudes={lista} />)
    const boton = await screen.findByRole('button', { name: /Mostrar los 2 clientes sin análisis/ })
    expect(screen.queryByText('Alfa Ltda')).toBeNull()
    fireEvent.click(boton)
    await waitFor(() => expect(screen.getByText('Alfa Ltda')).toBeTruthy())
    const apagadas = screen.getAllByRole('row').filter((r) => /apagado/.test(r.className))
    expect(apagadas).toHaveLength(2)
    expect(screen.queryByText('Inactivo SA')).toBeNull()
  })

  it('con solo Residuales visibles: sin filas de FSMA ni FITO, el total cuenta solo lo visible y salen del ranking los que no tienen residuales', () => {
    const conFsma = [...lista, sol('ALS', 'SOLO FSMA'), sol('ALS', 'SOLO FSMA'), sol('ALS', 'SOLO FSMA')]
    render(<AnalisisPorCliente solicitudes={conFsma} analisis={['residuales']} />)
    expect(screen.queryByText('FSMA')).toBeNull()
    expect(screen.queryByText('FITO')).toBeNull()
    expect(screen.queryByText('SOLO FSMA')).toBeNull() // su único análisis está oculto
    expect(screen.getByText('2 análisis')).toBeTruthy() // DOLE: 2 residuales (antes 4)
    expect(screen.getByText('1 análisis')).toBeTruthy() // MULTIFRUTA
  })

  it('los clientes sin ningún análisis del listado no cambian por ocultar un análisis', async () => {
    render(<AnalisisPorCliente solicitudes={lista} analisis={['residuales']} />)
    expect(await screen.findByRole('button', { name: /Mostrar los 2 clientes sin análisis/ })).toBeTruthy()
  })

  describe('Entregable propuesto (plan de los comerciales)', () => {
    const cant = { residuales: 0, fsma: 0, fito: 0 }
    const prop = (sold: string, p: Partial<typeof cant>, plantas: { planta: string; servicio: 'residuales' | 'fsma' | 'fito'; original: number; propuesta: number }[] = []) =>
      [sold.replace(/\./g, '').toUpperCase(), { sold_to: sold, original: { ...cant }, propuesta: { ...cant, ...p }, plantas }] as const
    const plan = new Map([prop('DOLE CHILE S.A.', { residuales: 8 }, [
      { planta: 'DOLE LONTUE', servicio: 'residuales', original: 4, propuesta: 5 },
      { planta: 'DOLE CODEGUA', servicio: 'residuales', original: 2, propuesta: 3 },
    ])])
    const titulo = 'Entregable propuesto: análisis prometidos en la temporada'

    it('por Sold To: muestra solo el entregable propuesto, con su cantidad y su % (lo llevado ÷ lo prometido)', () => {
      render(<AnalisisPorCliente solicitudes={lista} plan={plan} />)
      expect(screen.getByText('Entregable propuesto')).toBeTruthy()
      expect(screen.queryByText('Entregable original')).toBeNull()
      const dole = screen.getAllByRole('row').slice(2)[0]
      // DOLE lleva 2 residuales (AgroFresh 1 + Quiteca 1) de 8 propuestos = 25%
      expect(within(dole).getByTitle(titulo).textContent).toBe('8')
      expect(within(dole).getByTitle('2 de 8 (entregable propuesto)').textContent).toBe('25%')
      // FSMA no está en el plan: queda en guion (cantidad y %)
      const fsma = screen.getAllByRole('row').slice(2)[1]
      expect(within(fsma).getAllByText('—').length).toBe(2)
    })

    it('cada cliente se abre en sus plantas, como filas: las del plan y las de sus solicitudes, con lo hecho y lo prometido', () => {
      const conShip = [
        { ...sol('AGROFRESH', 'DOLE CHILE S.A.', true), ship_to: 'DOLE LONTUE' },
        { ...sol('QUITECA', 'DOLE CHILE S.A.'), ship_to: 'Dole Lontué' },
        { ...sol('ALS', 'DOLE CHILE S.A.'), ship_to: 'OTRA PLANTA' },
      ]
      render(<AnalisisPorCliente solicitudes={conShip} plan={plan} />)
      expect(screen.queryByText('DOLE LONTUE')).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: /Ver 3 plantas/ }))
      const lontue = screen.getByText('DOLE LONTUE').closest('tr') as HTMLElement
      // 2 residuales hechos (uno en cada laboratorio) de 5 prometidos a esa planta
      expect(within(lontue).getByTitle(titulo).textContent).toBe('5')
      expect(within(lontue).getByTitle('2 de 5 (entregable propuesto)').textContent).toBe('40%')
      // una planta del plan sin ningún análisis también sale, con lo prometido
      const codegua = screen.getByText('DOLE CODEGUA').closest('tr') as HTMLElement
      expect(within(codegua).getByTitle(titulo).textContent).toBe('3')
      // y una de las solicitudes que el plan no trae, sin prometido
      expect(screen.getByText('OTRA PLANTA')).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: /Ocultar 3 plantas/ }))
      expect(screen.queryByText('DOLE CODEGUA')).toBeNull()
    })

    it('un análisis prometido por el plan sale como línea aunque no tenga ninguno hecho, y un cliente del plan sin análisis también', () => {
      const plan2 = new Map([prop('DOLE CHILE S.A.', { residuales: 8 }), prop('MULTIFRUTA', { fito: 10 }), prop('SIN ANALISIS', { residuales: 7 })])
      render(<AnalisisPorCliente solicitudes={lista} plan={plan2} />)
      expect(screen.getByText('SIN ANALISIS')).toBeTruthy()
      // MULTIFRUTA no tiene FITO hecho, pero el plan se lo promete: aparece su línea
      expect(screen.getAllByText('FITO').length).toBeGreaterThanOrEqual(2)
      // Total de todos los clientes: residuales 8+7, FITO 10
      const tfoot = document.querySelector('tfoot') as HTMLElement
      expect(within(tfoot).getAllByTitle(titulo).map((e) => e.textContent)).toEqual(['15', '10'])
    })

    it('el Total no depende del Top N', () => {
      const plan2 = new Map([prop('SIN ANALISIS', { residuales: 7 })])
      render(<AnalisisPorCliente solicitudes={lista} plan={plan2} limite={1} />)
      const tfoot = document.querySelector('tfoot') as HTMLElement
      expect(within(tfoot).getAllByTitle(titulo).map((e) => e.textContent)).toEqual(['7'])
    })

    it('por Ship To, especie o tipo el cálculo se esconde', () => {
      render(<AnalisisPorCliente solicitudes={lista} plan={plan} dimension="planta" />)
      expect(screen.queryByText('Entregable propuesto')).toBeNull()
      expect(screen.queryByRole('button', { name: /plantas?$/ })).toBeNull()
    })
  })
})
