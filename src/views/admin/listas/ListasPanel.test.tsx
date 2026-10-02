import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EstadoListas, FilaEstado } from '@/features/listasDistribucion'

const api = vi.hoisted(() => ({
  obtenerEstado: vi.fn(),
  compararListas: vi.fn(),
  aplicarListas: vi.fn(),
  exportarListas: vi.fn(),
}))
vi.mock('@/features/listasDistribucion', async (original) => ({ ...(await original<typeof import('@/features/listasDistribucion')>()), ...api }))

import { CATEGORIAS } from '@/features/listasDistribucion'
import { ListasPanel } from './ListasPanel'

const revision = () => screen.getByRole('region', { name: 'Revisión de cambios' })
const todas = (l: string[]) => Object.fromEntries(CATEGORIAS.map((c) => [c, l]))
function fila(ship: string, o: Partial<FilaEstado> = {}): FilaEstado {
  return {
    sold_to: 'CLI SA', ship_to: ship, admin: ['jorge.sandoval@agrofresh.com'], comercial: ['com@agrofresh.com'], tecnico: ['tec@agrofresh.com'],
    clientes: todas(['cli@x.cl']), copia_mal: { admin: [], comercial: [], tecnico: [] }, en_listados: true, sin_contactos: false, ...o,
  }
}
const estado: EstadoListas = {
  filas: [fila('PLANTA UNO'), fila('PLANTA DOS', { tecnico: [] })],
  clientes: ['CLI SA'],
  resumen: { plantas_con_lista: 2, plantas_listados: 3, listados_sin_lista: 1 },
}

beforeEach(() => {
  vi.clearAllMocks()
  api.obtenerEstado.mockResolvedValue(estado)
  api.aplicarListas.mockResolvedValue({ aplicados: 1, plantas: 1, ignorados: [], respaldo: 'respaldo.json' })
})

describe('ListasPanel', () => {
  it('abre directo con la tabla y los indicadores, y marca lo que falta', async () => {
    render(<ListasPanel />)
    const tabla = await screen.findByRole('region', { name: 'Tabla de listas de distribución' })
    expect(screen.getByRole('button', { name: /Sin técnico/ })).toHaveTextContent('1')
    expect(within(tabla).getByText('⚠ Falta')).toBeInTheDocument()
  })

  it('cada servicio lee y guarda SU lista (Línea de proceso por defecto)', async () => {
    const { unmount } = render(<ListasPanel />)
    await screen.findByRole('region', { name: 'Tabla de listas de distribución' })
    expect(api.obtenerEstado).toHaveBeenLastCalledWith(false, 'linea')
    unmount()

    render(<ListasPanel servicio="actimist" />)
    fireEvent.click(await screen.findByRole('button', { name: /PLANTA DOS · Técnico a cargo: vacía/ }))
    expect(api.obtenerEstado).toHaveBeenLastCalledWith(false, 'actimist')
    const campo = screen.getByLabelText('Agregar correos')
    fireEvent.change(campo, { target: { value: 'tec.actimist@agrofresh.com' } })
    fireEvent.keyDown(campo, { key: 'Enter' })
    fireEvent.click(screen.getByRole('button', { name: 'Listo' }))
    fireEvent.click(screen.getByRole('button', { name: /Guardar 1 cambio/ }))
    const dialogo = await screen.findByRole('dialog')
    expect(dialogo).toHaveTextContent(/lista de Actimist/)
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(api.aplicarListas).toHaveBeenCalledTimes(1))
    expect(api.aplicarListas.mock.calls[0][1]).toBe('actimist')
  })

  it('un cambio hecho a mano queda aceptado y solo ese viaja al guardar', async () => {
    render(<ListasPanel />)
    fireEvent.click(await screen.findByRole('button', { name: /PLANTA DOS · Técnico a cargo: vacía/ }))
    const campo = screen.getByLabelText('Agregar correos')
    fireEvent.change(campo, { target: { value: 'nuevo.tec@agrofresh.com' } })
    fireEvent.keyDown(campo, { key: 'Enter' })
    fireEvent.click(screen.getByRole('button', { name: 'Listo' }))

    expect(revision()).toHaveTextContent(/1\s*aceptados/)
    fireEvent.click(screen.getByRole('button', { name: /Guardar 1 cambio/ }))
    const dialogo = await screen.findByRole('dialog')
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(api.aplicarListas).toHaveBeenCalledTimes(1))
    const enviados = api.aplicarListas.mock.calls[0][0]
    expect(enviados).toHaveLength(1)
    expect(enviados[0]).toMatchObject({ tipo: 'campo', campo: 'tecnico', agregar: ['nuevo.tec@agrofresh.com'], quitar: [], planta: { ship_to: 'PLANTA DOS' } })
    expect(await screen.findByText(/1 cambio guardado/)).toBeInTheDocument()
  })

  it('lo importado queda en amarillo hasta aceptarlo; rechazarlo lo quita sin guardar nada', async () => {
    api.compararListas.mockResolvedValue({
      cambios: [
        { id: 'a', tipo: 'campo', planta: { sold_to: 'CLI SA', ship_to: 'PLANTA UNO' }, campo: 'comercial', etiqueta: '', agregar: ['otro@agrofresh.com'], quitar: ['com@agrofresh.com'], corregir: [], aviso: null, fila: null },
      ],
      resumen: { plantas_excel: 2, plantas_sin_cambios: 1, plantas_con_cambios: 1, cambios: 1, plantas_solo_sistema: 0, solo_sistema: [] },
    })
    render(<ListasPanel />)
    await screen.findByRole('region', { name: 'Tabla de listas de distribución' })
    fireEvent.change(screen.getByLabelText('Importar Excel'), { target: { files: [new File(['x'], 'maestro.xlsx')] } })

    expect(await screen.findByText(/1 cambio en amarillo/)).toBeInTheDocument()
    expect(revision()).toHaveTextContent(/1\s*por revisar/)
    expect(screen.getByRole('button', { name: /^Guardar/ })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: /Rechazar el cambio en PLANTA UNO · Comercial/ }))
    expect(screen.queryByRole('region', { name: 'Revisión de cambios' })).not.toBeInTheDocument()
    expect(api.aplicarListas).not.toHaveBeenCalled()
  })

  it('«Aceptar los que solo agregan» no acepta los que quitan a alguien', async () => {
    api.compararListas.mockResolvedValue({
      cambios: [
        { id: 'a', tipo: 'campo', planta: { sold_to: 'CLI SA', ship_to: 'PLANTA UNO' }, campo: 'comercial', etiqueta: '', agregar: ['otro@agrofresh.com'], quitar: ['com@agrofresh.com'], corregir: [], aviso: null, fila: null },
        { id: 'b', tipo: 'campo', planta: { sold_to: 'CLI SA', ship_to: 'PLANTA DOS' }, campo: 'tecnico', etiqueta: '', agregar: ['nuevo@agrofresh.com'], quitar: [], corregir: [], aviso: null, fila: null },
      ],
      resumen: { plantas_excel: 2, plantas_sin_cambios: 0, plantas_con_cambios: 2, cambios: 2, plantas_solo_sistema: 0, solo_sistema: [] },
    })
    render(<ListasPanel />)
    await screen.findByRole('region', { name: 'Tabla de listas de distribución' })
    fireEvent.change(screen.getByLabelText('Importar Excel'), { target: { files: [new File(['x'], 'm.xlsx')] } })
    fireEvent.click(await screen.findByRole('button', { name: 'Aceptar los que solo agregan' }))
    expect(revision()).toHaveTextContent(/1\s*aceptados/)
    expect(revision()).toHaveTextContent(/1\s*por revisar/)
  })

  it('una planta nueva fuera de Listados pide crearse y muestra la sugerencia', async () => {
    api.compararListas.mockResolvedValue({
      cambios: [{
        id: 'n', tipo: 'planta_nueva', planta: { sold_to: 'NUEVO SA', ship_to: 'PLANTA LISONJERA' }, campo: 'planta', etiqueta: '', agregar: [], quitar: [], corregir: [],
        aviso: 'No existe', sugerencias: [{ sold_to: 'NUEVO SA', ship_to: 'PLANTA LISONJERAS' }],
        fila: { sold_to: 'NUEVO SA', ship_to: 'PLANTA LISONJERA', admin: [], comercial: ['c@agrofresh.com'], tecnico: [], clientes: todas([]) },
      }],
      resumen: { plantas_excel: 1, plantas_sin_cambios: 0, plantas_con_cambios: 1, cambios: 1, plantas_solo_sistema: 0, solo_sistema: [] },
    })
    render(<ListasPanel />)
    await screen.findByRole('region', { name: 'Tabla de listas de distribución' })
    fireEvent.change(screen.getByLabelText('Importar Excel'), { target: { files: [new File(['x'], 'm.xlsx')] } })
    expect(await screen.findByText('Planta nueva')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Crearla también en Listados/ })).toBeChecked()
    expect(screen.getByRole('button', { name: /Usar «PLANTA LISONJERAS»/ })).toBeInTheDocument()
  })
})
