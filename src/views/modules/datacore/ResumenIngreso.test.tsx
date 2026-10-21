import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ResumenIngreso } from './ResumenIngreso'
import { PANEL } from './fixturesIngreso'

// Chart.js necesita un canvas real: acá solo importa que reciba la tendencia.
const { creados } = vi.hoisted(() => ({ creados: [] as unknown[][] }))
vi.mock('chart.js', () => {
  class FakeChart {
    static register() {}
    constructor(...args: unknown[]) {
      creados.push(args)
    }
    destroy() {}
  }
  return { Chart: FakeChart, CategoryScale: {}, LinearScale: {}, LineController: {}, LineElement: {}, PointElement: {}, Tooltip: {}, Legend: {}, Filler: {} }
})

afterEach(() => {
  vi.clearAllMocks()
  creados.length = 0
})

describe('ResumenIngreso', () => {
  it('muestra las cifras del panel', () => {
    render(<ResumenIngreso panel={PANEL} error={null} onIr={() => {}} />)
    const cifra = (etiqueta: string) => screen.getByText(etiqueta).closest('button, div')?.textContent ?? ''
    expect(cifra('Esperando informe')).toContain('2')
    expect(cifra('Pendientes de aceptar')).toContain('4')
    expect(cifra('En seguimiento')).toContain('2')
    expect(cifra('Aceptados')).toContain('3')
    expect(cifra('Rechazados')).toContain('1')
    expect(cifra('Informes recibidos')).toContain('9')
    expect(cifra('Demora mediana')).toContain('2,5 d')
    expect(screen.getByText(/la más larga: 6 d/)).toBeInTheDocument()
  })

  it('dice hacia dónde va la demora y dibuja la tendencia', () => {
    render(<ResumenIngreso panel={PANEL} error={null} onIr={() => {}} />)
    expect(screen.getByText('La demora sube 1 día hábil por semana.')).toBeInTheDocument()
    expect(creados).toHaveLength(1)
    const config = creados[0][1] as { data: { datasets: { label: string }[] } }
    expect(config.data.datasets.map((d) => d.label)).toEqual(['Mediana semanal', 'Tendencia', 'ALS', 'Quiteca'])
  })

  it('lista por laboratorio y lo que falta, la más atrasada primero', () => {
    render(<ResumenIngreso panel={PANEL} error={null} onIr={() => {}} />)
    expect(screen.getByRole('cell', { name: 'ALS' })).toBeInTheDocument()
    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('OT-QUI0053')
    expect(items[0]).toHaveTextContent('4,5 d')
  })

  it('tocar una cifra lleva a la pestaña correspondiente, ya filtrada', () => {
    const onIr = vi.fn()
    render(<ResumenIngreso panel={PANEL} error={null} onIr={onIr} />)
    fireEvent.click(screen.getByRole('button', { name: /Esperando informe/ }))
    expect(onIr).toHaveBeenLastCalledWith({ pestana: 'solicitudes', estado: 'esperando' })
    fireEvent.click(screen.getByRole('button', { name: /En seguimiento/ }))
    expect(onIr).toHaveBeenLastCalledWith({ pestana: 'informes', estado: 'rojo' })
    fireEvent.click(screen.getByRole('button', { name: /Rechazados/ }))
    expect(onIr).toHaveBeenLastCalledWith({ pestana: 'informes', decision: 'rechazado' })
  })

  it('sin semanas con informes explica por qué no hay gráfico', () => {
    const vacio = { ...PANEL, tendencia: { puntos: [], laboratorios: [], pendiente_por_semana: null, recta: [] } }
    render(<ResumenIngreso panel={vacio} error={null} onIr={() => {}} />)
    expect(screen.getByText(/Todavía no hay informes con su demora calculada/)).toBeInTheDocument()
    expect(screen.getByText(/Aún no hay semanas suficientes/)).toBeInTheDocument()
    expect(creados).toHaveLength(0)
  })

  it('muestra el error del servidor', () => {
    render(<ResumenIngreso panel={null} error="Falta correr la migración" onIr={() => {}} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Falta correr la migración')
  })
})
