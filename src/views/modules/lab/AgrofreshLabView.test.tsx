import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AgrofreshLabView } from './AgrofreshLabView'
import type { DetalleGC, MuestraGCDetalle } from '@/features/emitir'

const { listarSolicitudes, parsearGCCompleto } = vi.hoisted(() => ({
  listarSolicitudes: vi.fn(),
  parsearGCCompleto: vi.fn(),
}))

vi.mock('@/features/emitir', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/emitir')>()),
  listarSolicitudes,
  parsearGCCompleto,
  cruzarConMuestra: vi.fn(),
}))

function vial(codigo: string, esMuestra: boolean): MuestraGCDetalle {
  return {
    codigo,
    seq_line: 1,
    fecha_inyeccion: '8/31/2026 12:54:49 PM',
    es_muestra: esMuestra,
    ubicacion: '1',
    resultados: [{ analito: 'DIFENILAMINA', codigo: 'DFA', area: null, amount: null, rettime: 7.63 }],
  }
}

function detalle(...muestras: MuestraGCDetalle[]): DetalleGC {
  return { cabecera: [], muestras }
}

async function soltarArchivo() {
  const { container } = render(
    <MemoryRouter>
      <AgrofreshLabView />
    </MemoryRouter>,
  )
  const entrada = container.querySelector('#gc-input') as HTMLInputElement
  const archivo = new File(['reporte'], 'GLPrprtB.txt', { type: 'text/plain' })
  fireEvent.change(entrada, { target: { files: [archivo] } })
}

/**
 * El archivo del GC se lee entero y una sola vez. Lo importante acá es que
 * pasar el reporte a planilla no dependa de que la corrida traiga muestras de
 * cliente: una curva de calibración es una corrida válida y también se revisa.
 */
describe('AgrofreshLabView · resultados del GC', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('abre una corrida sin ninguna muestra de cliente, en vez de rechazarla', async () => {
    /* Antes esta corrida respondía 400 ("ninguna muestra tiene un código
     * puro") y el archivo quedaba sin cargar: no se podía ni mirar ni bajar
     * a Excel. */
    listarSolicitudes.mockResolvedValue([])
    parsearGCCompleto.mockResolvedValue(
      detalle(vial('Curva 0.05 A5.10', false), vial('Blanco acetona', false)),
    )

    await soltarArchivo()

    expect(await screen.findByText(/Esta corrida no trae viales de cliente/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ver detalle' })).toBeTruthy()
    expect(screen.queryByText(/No se pudo leer el archivo/)).toBeNull()
  })

  it('lee el archivo una sola vez: el detalle no lo vuelve a subir', async () => {
    listarSolicitudes.mockResolvedValue([])
    parsearGCCompleto.mockResolvedValue(detalle(vial('GCNPD10062', true)))

    await soltarArchivo()

    fireEvent.click(await screen.findByRole('button', { name: 'Ver detalle' }))
    expect(await screen.findByText('Detalle del archivo del GC')).toBeTruthy()
    await waitFor(() => expect(parsearGCCompleto).toHaveBeenCalledTimes(1))
  })

  it('dice cuántos viales trae la corrida y cuántos son de cliente', async () => {
    listarSolicitudes.mockResolvedValue([])
    parsearGCCompleto.mockResolvedValue(
      detalle(vial('GCNPD10062', true), vial('Curva 0.05 A5.10', false)),
    )

    await soltarArchivo()

    expect(await screen.findByText(/2 vial\(es\), 1 de cliente/)).toBeTruthy()
  })
})
