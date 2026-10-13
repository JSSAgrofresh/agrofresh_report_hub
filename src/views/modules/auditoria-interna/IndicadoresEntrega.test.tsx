import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Hitos } from '@/features/auditoriaInterna'
import type { SolicitudAuditoria } from '@/features/auditoriaInterna'

const d = (dia: number) => `2026-09-${String(dia).padStart(2, '0')}T12:00:00Z`
const sol = (archivo: string, p: Partial<SolicitudAuditoria> = {}): SolicitudAuditoria => ({
  archivo, numero_solicitud: archivo, laboratorio: 'QUITECA', sold_to: 'A', ship_to: 'B', especie: null, variedad: null,
  tipo_servicio: null, analitos: ['FDL'], fecha_solicitud: null, fecha_muestreo: null, emitida_en: d(1),
  informe: null, en_report: false, concretada: false, ...p,
})
const hit = (archivo: string, p: Partial<Hitos>): Hitos => ({
  archivo, emitida: d(1), enviada: d(2), informe: null, informe_fuente: null, report: null, en_report: false, cliente: null, ...p,
})

vi.mock('@/features/auditoriaInterna', async (original) => {
  const real = await original<typeof import('@/features/auditoriaInterna')>()
  return {
    ...real,
    useEntrega: () => ({
      hitos: new Map([
        ['1', hit('1', { informe: d(6), observado: d(9), observado_por: ['DOLE · LONTUE'] })],
        ['2', hit('2', { informe: d(8) })],
      ]),
      calidad: null,
      reglas: { entregado: 'concretado', plazos: { QUITECA: 12, 'QUITECA|FDL': 8 }, cambiado_por: null, cambiado_en: null },
      error: null,
      guardar: vi.fn(),
    }),
  }
})

import { IndicadoresEntrega } from './IndicadoresEntrega'

describe('IndicadoresEntrega', () => {
  const solicitudes = [sol('1', { concretada: true, en_report: true }), sol('2', { concretada: true }), sol('3')]

  it('ya no trae el bloque largo «¿Cómo se calcula este número?»: la explicación va en globitos', () => {
    render(<IndicadoresEntrega solicitudes={solicitudes} puedeEditar={false} />)
    expect(screen.queryByText('¿Cómo se calcula este número?')).toBeNull()
    expect(screen.queryByText(/Por qué la mediana y no el promedio/)).toBeNull()
    const globitos = screen.getAllByRole('tooltip', { hidden: true })
    expect(globitos.some((g) => /mediana y no el promedio/.test(g.textContent ?? ''))).toBe(true)
    expect(globitos.some((g) => /percentil 90/.test(g.textContent ?? ''))).toBe(true)
  })

  it('deja una línea con la fórmula y cuántas solicitudes entran', () => {
    render(<IndicadoresEntrega solicitudes={solicitudes} puedeEditar={false} />)
    expect(screen.getAllByText(/entran al cálculo/).length).toBeGreaterThan(0)
    expect(screen.getByText(/Lead time/, { selector: 'b' })).toBeTruthy()
  })

  it('avisa a todos que la recepción es un estimado de 1 día y que se cuenta en días hábiles', () => {
    render(<IndicadoresEntrega solicitudes={solicitudes} puedeEditar={false} />)
    const aviso = screen.getByRole('note', { name: '' })
    expect(aviso.textContent).toMatch(/Estimado, no medido/)
    expect(aviso.textContent).toMatch(/1 día después de emitida/)
    expect(aviso.textContent).toMatch(/días hábiles/)
  })

  it('«Cuello de botella», «Rango por laboratorio», «Reglas del cálculo» y el desglose por tramo ya no existen', () => {
    render(<IndicadoresEntrega solicitudes={solicitudes} puedeEditar />)
    expect(screen.queryByText(/Cuello de botella/i)).toBeNull()
    expect(screen.queryByText(/Rango por laboratorio/i)).toBeNull()
    expect(screen.queryByText(/Reglas del cálculo/i)).toBeNull()
    expect(screen.queryByText(/Desglose por tramo/i)).toBeNull()
  })

  it('la configuración de plazos solo la ve el administrador general', () => {
    const { unmount } = render(<IndicadoresEntrega solicitudes={solicitudes} puedeEditar={false} />)
    expect(screen.queryByText('Configuración de plazos')).toBeNull()
    expect(screen.queryByLabelText(/plazo general/i)).toBeNull()
    unmount()
    render(<IndicadoresEntrega solicitudes={solicitudes} puedeEditar />)
    expect(screen.getByText('Configuración de plazos')).toBeTruthy()
    // plazo general del laboratorio y plazo propio del análisis FDL
    expect(screen.getByLabelText(/QUITECA\s*· plazo general/i)).toBeTruthy()
    expect((screen.getByLabelText(/^FDL\b/) as HTMLInputElement).value).toBe('8')
  })

  it('el flujograma muestra los puntos, con informe al cliente e informe en el sistema al mismo nivel', () => {
    render(<IndicadoresEntrega solicitudes={solicitudes} puedeEditar={false} />)
    for (const t of ['Solicitud emitida', 'Recepcionada por el laboratorio', 'En análisis', 'Informe recibido del laboratorio',
      'Informe enviado al cliente', 'Informe cargado al sistema', 'Reporte observado']) {
      expect(screen.getAllByText(t).length).toBeGreaterThan(0)
    }
    expect(screen.getByText('estimado')).toBeTruthy()
  })

  it('al tocar «Reporte observado» se abre un modal con los clientes que ya vieron su informe', () => {
    render(<IndicadoresEntrega solicitudes={solicitudes} puedeEditar={false} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Reporte observado/ }))
    const modal = screen.getByRole('dialog', { name: /Reporte observado · 1/ })
    expect(within(modal).getByText(/DOLE · LONTUE/)).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('debajo del flujograma lista el estado de cada solicitud, por defecto las que aún no tienen informe', () => {
    render(<IndicadoresEntrega solicitudes={solicitudes} puedeEditar={false} />)
    const zona = within(screen.getByRole('region', { name: 'Estado de cada solicitud' }))
    expect(zona.getAllByRole('listitem').map((li) => li.textContent)).toEqual([expect.stringContaining('3')])
    fireEvent.click(zona.getByRole('button', { name: /Todas/ }))
    expect(zona.getAllByRole('listitem')).toHaveLength(3)
    fireEvent.click(zona.getByRole('button', { name: /Informe sin enviar al cliente/ }))
    expect(zona.getAllByRole('listitem')).toHaveLength(2)
  })

  it('el flujo se puede filtrar por laboratorio', () => {
    render(<IndicadoresEntrega solicitudes={[...solicitudes, sol('4', { laboratorio: 'ALS' })]} puedeEditar={false} />)
    const select = screen.getByLabelText('Laboratorio del flujo') as HTMLSelectElement
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['', 'ALS', 'QUITECA'])
    fireEvent.change(select, { target: { value: 'ALS' } })
    expect(screen.getAllByText('1 solicitud llegó').length).toBeGreaterThan(0)
  })

  it('el cumplimiento queda en un desplegable cerrado, sin protagonismo', () => {
    const { container } = render(<IndicadoresEntrega solicitudes={solicitudes} puedeEditar={false} />)
    const resumen = screen.getByText('Cumplimiento del entregable')
    const detalles = resumen.closest('details') as HTMLDetailsElement
    expect(detalles).toBeTruthy()
    expect(detalles.open).toBe(false)
    expect(container.querySelectorAll('details').length).toBeGreaterThan(0)
  })

  it('el cumplimiento se puede ver por análisis', () => {
    render(<IndicadoresEntrega solicitudes={solicitudes} puedeEditar={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Análisis' }))
    expect(screen.getByText('Por análisis')).toBeTruthy()
    expect(screen.getAllByText(/QUITECA · FDL/).length).toBeGreaterThan(0)
  })
})
