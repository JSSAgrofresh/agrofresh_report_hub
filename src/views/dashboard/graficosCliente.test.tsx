import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { PanelCliente } from '@/features/dashboard'
import { InformesPorMes, SaludoCliente, UltimoInformeCliente } from './graficosCliente'

const datos: PanelCliente = {
  informes: 12,
  mediciones: 4321,
  analitos: 5,
  especies: 2,
  ultimos_30_dias: 3,
  ultimo: { informe: '2026-1885-PC', solicitud: 'OT-QUI0025', laboratorio: 'Quiteca', especie: 'Cereza', variedad: 'Lapins', fecha: '2026-10-08' },
  por_mes: [{ dia: '2026-09', n: 0 }, { dia: '2026-10', n: 4 }],
  por_especie: [],
  por_analito: [],
}

describe('widgets de cliente', () => {
  it('el saludo muestra la planta y sus contadores', () => {
    render(<SaludoCliente nombre="DOLE PLANTA CODEGUA" datos={datos} cargando={false} />)
    expect(screen.getByText(/DOLE PLANTA CODEGUA/)).toBeTruthy()
    expect(screen.getByText('12')).toBeTruthy()
    expect(screen.getByText(/informes de análisis/)).toBeTruthy()
    expect(screen.getByText(/en los últimos 30 días/)).toBeTruthy()
  })

  it('sin datos no se cae y avisa mientras carga', () => {
    render(<SaludoCliente nombre="X" datos={null} cargando />)
    expect(screen.getByText(/Cargando tus análisis/)).toBeTruthy()
  })

  it('el último informe dice fecha, especie y laboratorio', () => {
    render(<MemoryRouter><UltimoInformeCliente datos={datos} cargando={false} /></MemoryRouter>)
    expect(screen.getByText(/8 de octubre de 2026/)).toBeTruthy()
    expect(screen.getByText(/Cereza · Lapins/)).toBeTruthy()
    expect(screen.getByText('Quiteca')).toBeTruthy()
  })

  it('los meses sin informes quedan vacíos y los demás llevan su cifra', () => {
    render(<InformesPorMes datos={datos} cargando={false} />)
    expect(screen.getByText('4')).toBeTruthy()
  })

  it('sin ningún informe muestra el aviso en vez de un gráfico vacío', () => {
    render(<InformesPorMes datos={{ ...datos, por_mes: [{ dia: '2026-10', n: 0 }] }} cargando={false} />)
    expect(screen.getByText(/Todavía no hay datos/)).toBeTruthy()
  })
})
