import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import FueraDeRango from './FueraDeRango'
import type { Analito, LimiteAnalito, Observacion } from '../../../features/reportes'

const obs = (p: Partial<Observacion>): Observacion => ({
  solicitudId: 1, nroSolicitud: 'OT-1', ingrediente: 'FDL', ppm: 1, valorTexto: null, fecha: null, cliente: 'Dole',
  planta: 'Lontué', tipoAplicacion: 'Línea de proceso', tipoServicio: null, posicionMuestreo: null,
  laboratorio: 'QUITECA', crop: 'Cereza', variedad: null, semana: null, mes: null, ...p,
})
const analito = { id: 1, codigo: 'FDL', laboratorio: 'QUITECA' } as Analito
const limite = { id: 1, analito_id: 1, especie: '', tipo_servicio: '', limite_min: null, limite_central: null, limite_max: 10 } as LimiteAnalito

describe('FueraDeRango', () => {
  it('con límite cargado calcula el % y muestra la cuenta', () => {
    render(<FueraDeRango observaciones={[obs({ ppm: 5 }), obs({ ppm: 20 }), obs({ ppm: null })]} analitos={[analito]} limites={[limite]} sigma={2} />)
    expect(screen.getAllByText('50 %').length).toBeGreaterThan(0)
    expect(screen.getByText('1 de 2 evaluados')).toBeTruthy()
  })
  it('sin límites avisa y permite cambiar «Ver por»', () => {
    render(<FueraDeRango observaciones={[obs({ ppm: 5 })]} analitos={[analito]} limites={[]} sigma={2} />)
    fireEvent.click(screen.getByText('Límite del analito'))
    expect(screen.getByText(/Aún no hay límites residuales/)).toBeTruthy()
    fireEvent.click(screen.getByText('Cliente'))
    expect(screen.getByTitle('Dole')).toBeTruthy()
  })
})
