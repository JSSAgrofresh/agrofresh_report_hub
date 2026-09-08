import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { AnalitosPanel } from './AnalitosPanel'
import type { AnalitoConfig } from '@/features/tomaMuestras'

const { crearAnalitoConfig, actualizarAnalitoConfig } = vi.hoisted(() => ({
  crearAnalitoConfig: vi.fn(),
  actualizarAnalitoConfig: vi.fn(),
  eliminarAnalitoConfig: vi.fn(),
}))

vi.mock('@/features/tomaMuestras', () => ({
  crearAnalitoConfig,
  actualizarAnalitoConfig,
  eliminarAnalitoConfig: vi.fn(),
}))

const LEV: AnalitoConfig = {
  id: 1,
  laboratorio: 'DIAGNOFRUIT',
  categoria: 'Patógenos',
  codigo: 'LEV',
  nombre: 'Levaduras',
  unidad: 'UFC/mL',
  tipo: 'numero',
  dosis_aplicable: false,
  requerido: false,
  activo: true,
  orden: 1,
  tipo_aplicacion: '',
}

describe('AnalitosPanel', () => {
  it('al crear un analito nuevo, marcar "Lleva dosis" lo manda como dosis_aplicable: true', async () => {
    crearAnalitoConfig.mockResolvedValue({ ...LEV, id: 2, codigo: 'FDL', dosis_aplicable: true })
    render(
      <AnalitosPanel
        laboratorio="DIAGNOFRUIT"
        analitos={[LEV]}
        categorias={[]}
        onCambio={() => {}}
        onError={() => {}}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Agregar analito' }))
    fireEvent.change(screen.getByPlaceholderText('FDL'), { target: { value: 'FDL' } })
    fireEvent.change(screen.getByPlaceholderText('Fludioxonil'), { target: { value: 'Fludioxonil' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Lleva dosis (cromatografía)' }))
    fireEvent.click(screen.getByRole('button', { name: 'Agregar analito' }))

    await vi.waitFor(() =>
      expect(crearAnalitoConfig).toHaveBeenCalledWith(expect.objectContaining({ dosis_aplicable: true })),
    )
  })

  it('al editar, precarga el checkbox "Lleva dosis" con el valor guardado del analito', () => {
    render(
      <AnalitosPanel
        laboratorio="DIAGNOFRUIT"
        analitos={[LEV]}
        categorias={[]}
        onCambio={() => {}}
        onError={() => {}}
      />,
    )

    fireEvent.click(screen.getByTitle('Editar'))
    expect(screen.getByRole('checkbox', { name: 'Lleva dosis (cromatografía)' })).not.toBeChecked()
  })
})
