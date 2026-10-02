import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Solicitud } from '@/features/emitir'

const descargarPdfsZip = vi.fn().mockResolvedValue(undefined)
vi.mock('@/features/tomaMuestras', () => ({ descargarPdfsZip: (a: string[]) => descargarPdfsZip(a) }))

import { TablaSolicitudes } from './TablaSolicitudes'

function sol(n: number, codigo: string | null): Solicitud {
  return { archivo: `OT-AGF${n}.xlsx`, campos: { 'N° Solicitud': `OT-AGF${n}` }, analitos_solicitados: [], codigo_muestra: codigo }
}

const editarCruce = vi.fn()
const obtenerFotoCruce = vi.fn()
const guardarPesoExtraido = vi.fn()
vi.mock('@/features/emitir', async (orig) => ({
  ...(await orig<typeof import('@/features/emitir')>()),
  editarCruce: (a: string, d: unknown) => editarCruce(a, d),
  obtenerFotoCruce: (a: string) => obtenerFotoCruce(a),
  guardarPesoExtraido: (a: string, p: number) => guardarPesoExtraido(a, p),
}))

const props = { onVerFicha: vi.fn(), onQuitarCruce: vi.fn(), onCruceEditado: vi.fn() }

describe('TablaSolicitudes · Descargar PDFs', () => {
  beforeEach(() => descargarPdfsZip.mockClear())

  it('pregunta y baja todas, con o sin muestra', async () => {
    render(<TablaSolicitudes solicitudes={[sol(1, 'M1'), sol(2, null), sol(3, null)]} {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Descargar PDFs' }))
    expect(screen.getByText('¿Cuáles quieres descargar?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Todas/ }))
    await waitFor(() => expect(descargarPdfsZip).toHaveBeenCalledTimes(1))
    expect(descargarPdfsZip).toHaveBeenCalledWith(['OT-AGF1.xlsx', 'OT-AGF2.xlsx', 'OT-AGF3.xlsx'])
  })

  it('baja solo las que no están cruzadas', async () => {
    render(<TablaSolicitudes solicitudes={[sol(1, 'M1'), sol(2, null), sol(3, null)]} {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Descargar PDFs' }))
    fireEvent.click(screen.getByRole('button', { name: /Solo las que no están cruzadas/ }))
    await waitFor(() => expect(descargarPdfsZip).toHaveBeenCalledTimes(1))
    expect(descargarPdfsZip).toHaveBeenCalledWith(['OT-AGF2.xlsx', 'OT-AGF3.xlsx'])
  })

  it('con más de 200 baja en varios .zip', async () => {
    const muchas = Array.from({ length: 450 }, (_, i) => sol(i, null))
    render(<TablaSolicitudes solicitudes={muchas} {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Descargar PDFs' }))
    fireEvent.click(screen.getByRole('button', { name: /Todas/ }))
    await waitFor(() => expect(descargarPdfsZip).toHaveBeenCalledTimes(3))
    expect(descargarPdfsZip.mock.calls.map((c) => c[0].length)).toEqual([200, 200, 50])
  }, 30000)

  it('la opción «no cruzadas» se desactiva si todas ya tienen muestra', () => {
    render(<TablaSolicitudes solicitudes={[sol(1, 'M1')]} {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Descargar PDFs' }))
    expect(screen.getByRole('button', { name: /Solo las que no están cruzadas/ })).toBeDisabled()
  })
})


describe('TablaSolicitudes · corregir cruce y foto', () => {
  beforeEach(() => {
    editarCruce.mockReset().mockResolvedValue({})
    obtenerFotoCruce.mockReset().mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' }))
    props.onCruceEditado.mockReset()
    URL.createObjectURL = vi.fn(() => 'blob:foto')
    URL.revokeObjectURL = vi.fn()
  })

  const cruzada = { ...sol(7, 'AGF0007'), peso_muestra: 10, unidad_peso: 'kg', tiene_foto: true }

  it('muestra el peso y el ícono de foto solo si hay foto', () => {
    render(<TablaSolicitudes solicitudes={[cruzada, sol(8, null)]} {...props} />)
    expect(screen.getByText('10')).toBeInTheDocument()
    expect(screen.getAllByLabelText(/Ver foto de/)).toHaveLength(1)
  })

  it('el ícono abre la foto bajándola con la sesión', async () => {
    render(<TablaSolicitudes solicitudes={[cruzada]} {...props} />)
    fireEvent.click(screen.getByLabelText('Ver foto de AGF0007'))
    expect(await screen.findByAltText('Foto de la muestra AGF0007')).toBeInTheDocument()
    expect(obtenerFotoCruce).toHaveBeenCalledWith('OT-AGF7.xlsx')
  })

  it('corrige el peso y recarga; sin cambios no deja guardar', async () => {
    render(<TablaSolicitudes solicitudes={[cruzada]} {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Editar cruce' }))
    const guardar = screen.getByRole('button', { name: 'Guardar cambios' })
    expect(guardar).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/Peso/), { target: { value: '1' } })
    expect(guardar).toBeEnabled()
    fireEvent.click(guardar)
    await waitFor(() => expect(editarCruce).toHaveBeenCalledTimes(1))
    expect(editarCruce).toHaveBeenCalledWith('OT-AGF7.xlsx', { codigoMuestra: 'AGF0007', peso: 1, unidad: 'kg', foto: null })
    await waitFor(() => expect(props.onCruceEditado).toHaveBeenCalled())
  })

  it('un peso en cero no se puede guardar', () => {
    render(<TablaSolicitudes solicitudes={[cruzada]} {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Editar cruce' }))
    fireEvent.change(screen.getByLabelText(/Peso/), { target: { value: '0' } })
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled()
  })
})

describe('TablaSolicitudes · segundo peso (muestra extraída)', () => {
  const cruzadaSinPeso = { ...sol(7, 'AGF0007'), peso_muestra: 10, unidad_peso: 'kg' }

  it('pide el segundo peso solo en las filas cruzadas y lo guarda', async () => {
    guardarPesoExtraido.mockReset().mockResolvedValue({})
    render(<TablaSolicitudes solicitudes={[cruzadaSinPeso, sol(8, null)]} {...props} />)
    const inputs = screen.getAllByLabelText(/Segundo peso/)
    expect(inputs).toHaveLength(1)
    fireEvent.change(inputs[0], { target: { value: '5.025' } })
    fireEvent.keyDown(inputs[0], { key: 'Enter' })
    await waitFor(() => expect(guardarPesoExtraido).toHaveBeenCalledWith('OT-AGF7.xlsx', 5.025))
  })

  it('la fila pasa a verde fuerte cuando el peso ya está guardado', () => {
    const { container } = render(
      <TablaSolicitudes solicitudes={[cruzadaSinPeso, { ...sol(9, 'AGF0009'), peso_muestra_extraido: 5.1 }]} {...props} />,
    )
    const filas = container.querySelectorAll('tbody tr')
    expect(filas[0].className).toMatch(/lista/)
    expect(filas[0].className).not.toMatch(/listaCompleta/)
    expect(filas[1].className).toMatch(/listaCompleta/)
  })

  it('«Quitar muestra» no aparece sin permiso', () => {
    render(<TablaSolicitudes solicitudes={[cruzadaSinPeso]} {...props} />)
    expect(screen.queryByRole('button', { name: 'Quitar muestra' })).toBeNull()
  })
})
