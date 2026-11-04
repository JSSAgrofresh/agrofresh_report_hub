import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { SolicitudAuditoria } from '@/features/auditoriaInterna'
import type { ClientePlan } from '@/features/planEntregables'
import { DinamicaPlan } from './DinamicaPlan'
import { GraficosPlan } from './GraficosPlan'

const sol = (lab: string, ship: string, fecha: string) =>
  ({ archivo: Math.random().toString(), laboratorio: lab, sold_to: 'DOLE CHILE S.A.', ship_to: ship, fecha_muestreo: fecha, fecha_solicitud: null, emitida_en: null, concretada: false }) as unknown as SolicitudAuditoria

const fila = (planta: string, semana: string, propuesta: number) => ({ planta, servicio: 'residuales' as const, semana, original: propuesta, propuesta, comercial: 'JC LABARCA', tipo_cliente: 'Estrategico' })
const plan = new Map<string, ClientePlan>([
  ['DOLE CHILE SA', {
    sold_to: 'DOLE CHILE S.A.', original: { residuales: 0, fsma: 0, fito: 0 }, propuesta: { residuales: 7, fsma: 0, fito: 0 }, plantas: [],
    semanas: [fila('DOLE LONTUE', 'W45', 3), fila('DOLE LONTUE', 'W46', 4)],
  }],
])
const lista = [sol('AGROFRESH', 'DOLE LONTUE', '2026-11-04'), sol('QUITECA', 'DOLE LONTUE', '2026-11-04')]

describe('DinamicaPlan', () => {
  it('un renglón por cliente (con comercial y tipo en columnas) que se abre en sus plantas, con las semanas y lo hecho sobre lo propuesto', () => {
    render(<DinamicaPlan solicitudes={lista} plan={plan} />)
    const cliente = screen.getByText('DOLE CHILE S.A.').closest('tr') as HTMLElement
    expect(within(cliente).getByText('JC LABARCA')).toBeTruthy()
    expect(within(cliente).getByText('Estratégico')).toBeTruthy()
    expect(screen.queryByText('DOLE LONTUE')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir DOLE CHILE S.A.' }))
    const planta = screen.getByText('DOLE LONTUE').closest('tr') as HTMLElement
    // W45: 2 hechos de 3 propuestos; W46: nada hecho de 4
    expect(within(planta).getByTitle(/Hecho 2 de 3 propuestos · AgroFresh 1 · Quiteca 1/).textContent).toBe('2/3')
    expect(within(planta).getByTitle('Hecho 0 de 4 propuestos').textContent).toBe('0/4')
    // columna Total de la planta: 2 hechos de 7 propuestos
    expect(within(planta).getByTitle('Hecho 2 de 7 propuestos · AgroFresh 1 · Quiteca 1').textContent).toBe('2/7')
    for (const w of ['W41', 'W49', 'W02']) expect(screen.getByText(w)).toBeTruthy()
  })

  it('«Propuesto» y «Hecho» muestran un solo número', () => {
    render(<DinamicaPlan solicitudes={lista} plan={plan} />)
    fireEvent.click(screen.getByRole('button', { name: 'Abrir todo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Propuesto' }))
    const planta = screen.getByText('DOLE LONTUE').closest('tr') as HTMLElement
    expect(within(planta).getByTitle(/Hecho 2 de 3 propuestos/).textContent).toBe('3')
    fireEvent.click(screen.getByRole('button', { name: 'Hecho' }))
    expect(within(screen.getByText('DOLE LONTUE').closest('tr') as HTMLElement).getByTitle(/Hecho 2 de 3/).textContent).toBe('2')
  })

  it('sin detalle por semana (falta la 0073) lo avisa', () => {
    render(<DinamicaPlan solicitudes={lista} plan={new Map([['DOLE CHILE SA', { ...plan.get('DOLE CHILE SA')!, semanas: [] }]])} />)
    expect(screen.getByText(/no trae el detalle por semana/)).toBeTruthy()
  })
})

describe('GraficosPlan', () => {
  const todos = ['residuales', 'fsma', 'fito'] as const
  it('parte plegado y se despliega con «Ver gráficos»: lo que llevamos y lo esperado a la izquierda, el top 10 a la derecha', () => {
    render(<GraficosPlan solicitudes={lista} plan={plan} analisis={[...todos]} />)
    expect(screen.queryByText('Cuándo se concentra el trabajo')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Ver gráficos/ }))
    expect(screen.getByText('Lo que llevamos')).toBeTruthy()
    expect(screen.getByText('Cuándo se concentra el trabajo')).toBeTruthy()
    expect(screen.getByText('Los 10 clientes con más análisis')).toBeTruthy()
    // el top divide la barra por laboratorio
    expect(screen.getByText('Residuales · AgroFresh')).toBeTruthy()
    expect(screen.getByText('Residuales · Quiteca')).toBeTruthy()
    expect(screen.getByText('FSMA · ALS')).toBeTruthy()
    expect(screen.getByText('FITO · Diagnofruit')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Ocultar gráficos/ }))
    expect(screen.queryByText('Los 10 clientes con más análisis')).toBeNull()
  })

  it('un clic en la barra de un cliente abre su detalle por sucursal, con lo hecho por laboratorio y lo propuesto', () => {
    const conPlantas = [...lista, { ...sol('ALS', 'OTRA PLANTA', '2026-11-04') }]
    render(<GraficosPlan solicitudes={conPlantas} plan={plan} analisis={[...todos]} abiertoInicial />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver el detalle de DOLE CHILE S.A.' }))
    const dialogo = screen.getByRole('dialog')
    expect(within(dialogo).getByText('DOLE CHILE S.A.')).toBeTruthy()
    expect(within(dialogo).getByText('JC LABARCA · Estratégico')).toBeTruthy()
    const lontue = within(dialogo).getByText('DOLE LONTUE').closest('tr') as HTMLElement
    // 2 hechos (AgroFresh y Quiteca) de 7 propuestos a esa planta
    expect(within(lontue).getByText('7')).toBeTruthy()
    expect(within(lontue).getByText('29%')).toBeTruthy()
    // una planta que el plan no trae también sale, sin plan
    expect(within(dialogo).getByText('OTRA PLANTA')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
