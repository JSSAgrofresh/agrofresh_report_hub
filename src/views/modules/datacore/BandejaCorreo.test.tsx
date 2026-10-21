import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { BandejaCorreo } from './BandejaCorreo'
import type { DetalleInformeCorreo } from '@/features/correoInformes'
import { bandeja, INFORME_OK, INFORME_ROJO } from './fixturesIngreso'

const { listarBandeja, detalleInformeCorreo, pdfInformeCorreo, rechazarInforme, volverAPendiente, resolverSeguimiento } = vi.hoisted(() => ({
  listarBandeja: vi.fn(),
  detalleInformeCorreo: vi.fn(),
  pdfInformeCorreo: vi.fn(),
  rechazarInforme: vi.fn(),
  volverAPendiente: vi.fn(),
  resolverSeguimiento: vi.fn(),
}))

vi.mock('@/features/correoInformes', async () => {
  const real = await vi.importActual<typeof import('@/features/correoInformes')>('@/features/correoInformes')
  return { ...real, listarBandeja, detalleInformeCorreo, pdfInformeCorreo, rechazarInforme, volverAPendiente, resolverSeguimiento }
})

const DETALLE: DetalleInformeCorreo = {
  ...INFORME_ROJO,
  para: ['patricio.caceres@unifrutti.com'],
  cc: ['juan.labarca@agrofresh.com'],
  bcc: ['agrofreshreporthub@gmail.com'],
  esperado: { to: ['contacto@agrovic.cl'], cc: ['juan.labarca@agrofresh.com'], bcc: [] },
  propios: ['agrofreshreporthub@gmail.com'],
}

afterEach(() => vi.clearAllMocks())

describe('BandejaCorreo', () => {
  it('lista los informes con su estado, marca lo ya cargado y los reenvíos', async () => {
    listarBandeja.mockResolvedValue(bandeja([INFORME_ROJO, INFORME_OK]))
    render(<BandejaCorreo version={0} onCambio={() => {}} />)
    expect(await screen.findByText('Quiteca · OT-QUI0053')).toBeInTheDocument()
    expect(screen.getByText('2026-1914-PC')).toBeInTheDocument()
    expect(screen.getByText('Seguimiento', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByText(/NO están en la lista/)).toBeInTheDocument()
    expect(screen.getByText('Ya cargado')).toBeInTheDocument()
    expect(screen.getByText('Reenvío')).toBeInTheDocument()
    expect(screen.getByText('Todo calza con su solicitud.')).toBeInTheDocument()
  })

  it('parte en «Pendientes» y cambiar de decisión vuelve a pedir la lista con ese filtro', async () => {
    listarBandeja.mockResolvedValue(bandeja([INFORME_ROJO]))
    render(<BandejaCorreo version={0} onCambio={() => {}} />)
    await screen.findByText('2026-1914-PC')
    expect(listarBandeja).toHaveBeenLastCalledWith('', '', 'pendiente')
    fireEvent.click(screen.getByRole('button', { name: /Rechazados/ }))
    await waitFor(() => expect(listarBandeja).toHaveBeenLastCalledWith('', '', 'rechazado'))
    fireEvent.click(screen.getByRole('button', { name: /Seguimiento/ }))
    await waitFor(() => expect(listarBandeja).toHaveBeenLastCalledWith('rojo', '', 'rechazado'))
  })

  it('si se llegó desde una cifra del resumen, parte con ese filtro', async () => {
    listarBandeja.mockResolvedValue(bandeja([INFORME_ROJO]))
    render(<BandejaCorreo version={0} inicial={{ estado: 'rojo' }} onCambio={() => {}} />)
    await screen.findByText('2026-1914-PC')
    expect(listarBandeja).toHaveBeenLastCalledWith('rojo', '', '')
  })

  it('al abrir un informe muestra a quién debía llegar contra a quién llegó', async () => {
    listarBandeja.mockResolvedValue(bandeja([INFORME_ROJO]))
    detalleInformeCorreo.mockResolvedValue(DETALLE)
    render(<BandejaCorreo version={0} onCambio={() => {}} />)
    fireEvent.click(await screen.findByText('Quiteca · OT-QUI0053'))
    expect(await screen.findByText('contacto@agrovic.cl')).toBeInTheDocument()
    expect(screen.getByText('no llegó')).toBeInTheDocument()
    expect(screen.getByText('patricio.caceres@unifrutti.com')).toBeInTheDocument()
    expect(screen.getByText('no está en la lista')).toBeInTheDocument()
    expect(screen.queryByText('agrofreshreporthub@gmail.com')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ver el PDF' })).toBeInTheDocument()
  })

  it('rechazar exige el motivo, lo manda y avisa para releer el panel', async () => {
    listarBandeja.mockResolvedValue(bandeja([INFORME_ROJO]))
    detalleInformeCorreo.mockResolvedValue(DETALLE)
    rechazarInforme.mockResolvedValue({ ok: true })
    const onCambio = vi.fn()
    render(<BandejaCorreo version={0} onCambio={onCambio} />)
    fireEvent.click(await screen.findByText('Quiteca · OT-QUI0053'))
    const boton = await screen.findByRole('button', { name: 'Rechazar este informe' })
    expect(boton).toBeDisabled()
    fireEvent.change(screen.getByPlaceholderText('Escribe una nota…'), { target: { value: 'Salió al cliente equivocado' } })
    expect(boton).toBeEnabled()
    fireEvent.click(boton)
    await waitFor(() => expect(rechazarInforme).toHaveBeenCalledWith(1, 'Salió al cliente equivocado'))
    await waitFor(() => expect(onCambio).toHaveBeenCalled())
  })

  it('un informe en rojo se puede dar por resuelto con una nota', async () => {
    listarBandeja.mockResolvedValue(bandeja([INFORME_ROJO]))
    detalleInformeCorreo.mockResolvedValue(DETALLE)
    resolverSeguimiento.mockResolvedValue({ ok: true })
    render(<BandejaCorreo version={0} onCambio={() => {}} />)
    fireEvent.click(await screen.findByText('Quiteca · OT-QUI0053'))
    await screen.findByRole('button', { name: 'Marcar seguimiento como resuelto' })
    fireEvent.change(screen.getByPlaceholderText('Escribe una nota…'), { target: { value: 'Quiteca reenvió bien' } })
    fireEvent.click(screen.getByRole('button', { name: 'Marcar seguimiento como resuelto' }))
    await waitFor(() => expect(resolverSeguimiento).toHaveBeenCalledWith(1, 'Quiteca reenvió bien'))
  })

  it('un rechazado se puede devolver a pendiente', async () => {
    const rechazado = { ...INFORME_OK, decision: 'rechazado' as const, nota: 'duplicado', decidido_por: 'jorge', decidido_en: '2026-10-21T12:00:00Z' }
    listarBandeja.mockResolvedValue(bandeja([rechazado]))
    detalleInformeCorreo.mockResolvedValue({ ...DETALLE, ...rechazado })
    volverAPendiente.mockResolvedValue({ ok: true })
    render(<BandejaCorreo version={0} onCambio={() => {}} />)
    fireEvent.click(await screen.findByText('Quiteca · OT-QUI0051'))
    fireEvent.click(await screen.findByRole('button', { name: 'Volver a pendiente' }))
    await waitFor(() => expect(volverAPendiente).toHaveBeenCalledWith(2))
  })

  it('sin informes explica cómo traerlos', async () => {
    listarBandeja.mockResolvedValue({ ...bandeja([]), conteos: { ...bandeja([]).conteos, todos: 0 } })
    render(<BandejaCorreo version={0} onCambio={() => {}} />)
    expect(await screen.findByText(/Revisar el correo ahora/)).toBeInTheDocument()
  })
})
