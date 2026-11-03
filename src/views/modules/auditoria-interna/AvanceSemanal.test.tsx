import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { SolicitudAuditoria } from '@/features/auditoriaInterna'
import type { ClientePlan } from '@/features/planEntregables'
import { AvanceSemanal } from './AvanceSemanal'

const sol = (lab: string, ship: string, fecha: string) =>
  ({ archivo: Math.random().toString(), laboratorio: lab, sold_to: 'DOLE CHILE S.A.', ship_to: ship, fecha_muestreo: fecha, fecha_solicitud: null, emitida_en: null, concretada: false }) as unknown as SolicitudAuditoria

const plan = new Map<string, ClientePlan>([
  ['DOLE CHILE SA', {
    sold_to: 'DOLE CHILE S.A.', original: { residuales: 0, fsma: 0, fito: 0 }, propuesta: { residuales: 0, fsma: 0, fito: 0 }, plantas: [],
    semanas: [
      { planta: 'DOLE LONTUE', servicio: 'residuales', semana: 'W45', original: 1, propuesta: 3 },
      { planta: 'DOLE LONTUE', servicio: 'residuales', semana: 'W46', original: 2, propuesta: 4 },
    ],
  }],
])
const lista = [sol('AGROFRESH', 'DOLE LONTUE', '2026-11-04'), sol('QUITECA', 'DOLE LONTUE', '2026-11-10')]

describe('AvanceSemanal', () => {
  it('muestra lo hecho contra lo que tocaba en la semana elegida y, abierta la planta, por planta', () => {
    render(<AvanceSemanal solicitudes={lista} plan={plan} />)
    fireEvent.change(screen.getByLabelText('Semana'), { target: { value: 'W46' } })
    const fila = screen.getByText('DOLE CHILE S.A.').closest('tr') as HTMLElement
    expect(within(fila).getAllByTitle('Lo que tocaba según el plan')[0].textContent).toBe('4')
    expect(within(fila).getAllByTitle('Análisis hechos')[0].textContent).toBe('1')
    expect(within(fila).getAllByTitle('Análisis hechos en Quiteca')[0].textContent).toBe('1')
    expect(within(fila).getByText('25%')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Ver 1 planta/ }))
    expect(screen.getByText('DOLE LONTUE')).toBeTruthy()
  })

  it('acumulado suma las semanas anteriores', () => {
    render(<AvanceSemanal solicitudes={lista} plan={plan} />)
    fireEvent.click(screen.getByRole('button', { name: 'Acumulado' }))
    fireEvent.change(screen.getByLabelText('Semana'), { target: { value: 'W46' } })
    const fila = screen.getByText('DOLE CHILE S.A.').closest('tr') as HTMLElement
    expect(within(fila).getAllByTitle('Lo que tocaba según el plan')[0].textContent).toBe('7')
    expect(within(fila).getAllByTitle('Análisis hechos')[0].textContent).toBe('2')
  })

  it('sin detalle por semana (falta la 0073) lo avisa', () => {
    const sin = new Map([['DOLE CHILE SA', { ...plan.get('DOLE CHILE SA')!, semanas: [] }]])
    render(<AvanceSemanal solicitudes={lista} plan={sin} />)
    expect(screen.getByText(/no trae el detalle por semana/)).toBeTruthy()
  })
})
