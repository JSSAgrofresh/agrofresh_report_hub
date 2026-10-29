import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DetalleCostoKilo, ResumenCostoKilo } from '@/features/costoKilo'

const informe = (carpeta: string, planta: string): ResumenCostoKilo => ({
  carpeta, guardado_en: null, cliente: 'DOLE', planta, linea: 'Línea 2', equipo: 'C&M-500', origen: 'manual', desde: '2025-12-05', hasta: '2025-12-12',
  semanas: 'Sem 49-50', dias: 2, lecturas: 48, kg_total: 300, litros: { FDL: 6 }, ml_por_kg: { FDL: 20 }, codigos: ['FDL', 'PYR'], nombres: { FDL: 'Fludioxonil' },
})
const LISTA = [informe('2026-11-02_09-00-00', 'DOLE LONTUE'), informe('2026-10-30_09-00-00', 'DOLE MOLINA')]
const ver = vi.fn()
const pdf = vi.fn()
const excel = vi.fn()

vi.mock('@/features/costoKilo', async (original) => ({
  ...(await original<typeof import('@/features/costoKilo')>()),
  verCostoKilo: (...a: unknown[]) => ver(...a),
  descargarPdfCostoKilo: (...a: unknown[]) => pdf(...a),
  descargarExcelCostoKilo: (...a: unknown[]) => excel(...a),
}))
vi.mock('./GraficoCostoKilo', () => ({
  GraficoCostoKilo: ({ titulo, lineas }: { titulo: string; lineas: { nombre: string }[] }) => <div>grafico {titulo} [{lineas.map((l) => l.nombre).join('|')}]</div>,
}))

import { SeccionCostoKilo } from './SeccionCostoKilo'

beforeEach(() => {
  ver.mockReset()
  pdf.mockReset().mockResolvedValue(undefined)
  excel.mockReset().mockResolvedValue(undefined)
  ver.mockImplementation((_m: string, carpeta: string) =>
    Promise.resolve({
      ...LISTA.find((r) => r.carpeta === carpeta)!, archivo: 'a.csv',
      resumen: {
        desde: '2025-12-05', hasta: '2025-12-12', lecturas: 48, codigos: ['FDL', 'PYR'],
        dias: [{ fecha: '2025-12-05', lecturas: 24, kg: 100, sm_lamina: 1, sm_mant: 2, sm_total: 3, activos: { FDL: 2, PYR: 0 }, parcial: false, ml_por_kg: {} }],
        totales: { kg: 300, sm_total: 9, activos: { FDL: 6, PYR: 0 }, ml_por_kg: { FDL: 20, PYR: 0 } },
      },
    } satisfies DetalleCostoKilo),
  )
})

describe('SeccionCostoKilo', () => {
  it('muestra sus dos gráficos solo con los ingredientes que gastaron producto, y baja el PDF y el Excel del informe', async () => {
    render(<SeccionCostoKilo informes={LISTA} modo="cliente" numero={2} acento="#2a6f97" />)
    expect(await screen.findByText(/grafico Kg de fruta por día y solución madre del día/)).toBeInTheDocument()
    const g2 = screen.getByText(/grafico Litros de producto comercial por día/)
    expect(g2.textContent).toContain('FDL (Fludioxonil) (litros)')
    expect(g2.textContent).not.toContain('PYR')
    expect(ver).toHaveBeenCalledWith('cliente', '2026-11-02_09-00-00')

    fireEvent.click(screen.getByRole('button', { name: /Informe PDF/ }))
    await waitFor(() => expect(pdf).toHaveBeenCalledWith('cliente', '2026-11-02_09-00-00'))
    fireEvent.click(screen.getByRole('button', { name: /Excel/ }))
    await waitFor(() => expect(excel).toHaveBeenCalledWith('cliente', '2026-11-02_09-00-00'))
  })

  it('al elegir otro informe pide ese; con uno solo no ofrece selector', async () => {
    const { rerender } = render(<SeccionCostoKilo informes={LISTA} modo="equipo" numero={1} acento="#2a6f97" />)
    await screen.findByText(/grafico Kg de fruta/)
    fireEvent.change(screen.getByLabelText('Informe'), { target: { value: '2026-10-30_09-00-00' } })
    await waitFor(() => expect(ver).toHaveBeenCalledWith('equipo', '2026-10-30_09-00-00'))
    rerender(<SeccionCostoKilo informes={[LISTA[0]]} modo="equipo" numero={1} acento="#2a6f97" />)
    expect(screen.queryByLabelText('Informe')).not.toBeInTheDocument()
  })

  it('sin informes no dibuja nada', () => {
    const { container } = render(<SeccionCostoKilo informes={[]} modo="cliente" numero={2} acento="#2a6f97" />)
    expect(container).toBeEmptyDOMElement()
  })
})
