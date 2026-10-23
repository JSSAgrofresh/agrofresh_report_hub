import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FilaRegistro } from '@/features/correoInformes'

const { leer } = vi.hoisted(() => ({ leer: vi.fn() }))
vi.mock('@/features/correoInformes', async (original) => ({
  ...(await original<typeof import('@/features/correoInformes')>()),
  leerRegistro: leer,
}))

import { RegistroInformes } from './RegistroInformes'

const f = (o: Partial<FilaRegistro>): FilaRegistro => ({
  id: 'x', situacion: 'cargado', laboratorio: 'Quiteca', ot: 'OT-QUI0049', informe: '2026-1908-PC', sold_to: 'AGRICOLA X', ship_to: 'PLANTA X', especie: 'Manzana',
  tipo_aplicacion: 'Ecofog', emitida: '2026-10-01T12:00:00Z', enviada_lab: '2026-10-02T12:00:00Z', fecha_muestreo: '2026-10-08', fecha_informe: '2026-10-09',
  llegada: '2026-10-10T12:00:00Z', llegada_por: 'correo', cargado: '2026-10-13T12:00:00Z', cargado_por: 'Jorge', carga_archivo: null, origen: 'manual',
  enviado_cliente: null, correo_id: null, envios: 0, problemas: [], ...o,
})

const FILAS = [
  f({ id: 'a', informe: 'INF-AUTO', ot: 'OT-1', origen: 'automatica' }),
  f({ id: 'b', informe: 'INF-MANUAL', ot: 'OT-2', origen: 'manual', problemas: [{ codigo: 'FECHAS_NO_CUADRAN', gravedad: 'alto', texto: 'La fecha de entrada es anterior al muestreo', origen: 'datos' }] }),
  f({ id: 'c', informe: 'INF-PENDIENTE', ot: 'OT-3', situacion: 'por_aceptar', origen: 'sin_cargar', cargado: null }),
  f({ id: 'd', informe: null, ot: 'OT-ESPERA', situacion: 'esperando', origen: 'sin_cargar', cargado: null, llegada: null }),
]

describe('RegistroInformes', () => {
  beforeEach(() => leer.mockReset().mockResolvedValue({ filas: FILAS }))

  it('muestra todos los informes, uno por fila, menos los que solo esperan', async () => {
    render(<RegistroInformes version={0} />)
    expect(await screen.findByText('INF-AUTO')).toBeTruthy()
    expect(screen.getByText('INF-MANUAL')).toBeTruthy()
    expect(screen.getByText('INF-PENDIENTE')).toBeTruthy()
    expect(screen.queryByText('OT-ESPERA')).toBeNull()
  })

  it('dice cómo se cargó cada uno: automática o a mano', async () => {
    render(<RegistroInformes version={0} />)
    await screen.findByText('INF-AUTO')
    expect(screen.getByText('Automática (correo)')).toBeTruthy()
    expect(screen.getByText('Manual (Converter)')).toBeTruthy()
  })

  it('los filtros separan lo automático, lo manual y los problemas', async () => {
    render(<RegistroInformes version={0} />)
    await screen.findByText('INF-AUTO')
    fireEvent.click(screen.getByRole('button', { name: /Cargados automático/ }))
    expect(screen.queryByText('INF-MANUAL')).toBeNull()
    expect(screen.getByText('INF-AUTO')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Con problemas/ }))
    expect(screen.getByText('INF-MANUAL')).toBeTruthy()
    expect(screen.queryByText('INF-AUTO')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Esperando informe/ }))
    expect(screen.getByText('OT-ESPERA')).toBeTruthy()
  })

  it('un clic en la fila muestra lo que salió mal y el recorrido', async () => {
    render(<RegistroInformes version={0} />)
    await screen.findByText('INF-MANUAL')
    fireEvent.click(screen.getByRole('button', { name: 'Ver el detalle de INF-MANUAL' }))
    const detalle = screen.getByText('Qué pasó con este informe').closest('div') as HTMLElement
    expect(within(detalle).getByText('La fecha de entrada es anterior al muestreo')).toBeTruthy()
    expect(screen.getByText('Recorrido')).toBeTruthy()
  })

  it('el buscador encuentra por cliente', async () => {
    render(<RegistroInformes version={0} inicial={{ q: 'zzz' }} />)
    expect(await screen.findByText('Ningún informe coincide con lo que buscas.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Buscar informes'), { target: { value: 'agricola' } })
    expect(screen.getByText('INF-AUTO')).toBeTruthy()
  })

  it('si falla, lo dice', async () => {
    leer.mockRejectedValueOnce(new Error('boom'))
    render(<RegistroInformes version={0} />)
    expect((await screen.findByRole('alert')).textContent).toBe('boom')
  })
})
