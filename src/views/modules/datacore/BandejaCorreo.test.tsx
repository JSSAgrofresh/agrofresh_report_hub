import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { BandejaCorreo } from './BandejaCorreo'
import type { Bandeja, DetalleInformeCorreo, InformeCorreo } from '@/features/correoInformes'

const { listarBandeja, detalleInformeCorreo, revisarCorreoAhora, pdfInformeCorreo } = vi.hoisted(() => ({
  listarBandeja: vi.fn(),
  detalleInformeCorreo: vi.fn(),
  revisarCorreoAhora: vi.fn(),
  pdfInformeCorreo: vi.fn(),
}))

vi.mock('@/features/correoInformes', async () => {
  const real = await vi.importActual<typeof import('@/features/correoInformes')>('@/features/correoInformes')
  return { ...real, listarBandeja, detalleInformeCorreo, revisarCorreoAhora, pdfInformeCorreo }
})

const BASE: InformeCorreo = {
  id: 1,
  laboratorio: 'Quiteca',
  soportado: true,
  nro_informe: '2026-1914-PC',
  ot: 'OT-QUI0053',
  sold_to: 'FRUTAS AGROVIC LIMITADA',
  ship_to: 'FRUTAS AGROVIC LIMITADA',
  especie: 'cereza',
  fecha_muestreo: '2026-10-14',
  asunto: 'Informe Quiteca 2026-1914-PC (16/10/2026)',
  remitente: 'informes@quiteca.cl',
  llegada_en: '2026-10-20T20:21:00Z',
  enviado_en: '2026-10-20T20:21:00Z',
  estado: 'rojo',
  ya_cargado: false,
  revisado_en: null,
  resuelto_en: null,
  hallazgos: [{ nivel: 'rojo', codigo: 'destinatarios_de_mas', texto: 'Salió a personas que NO están en la lista de la solicitud: patricio@unifrutti.com' }],
  pdf_nombre: '2026-1914-PC.pdf',
  tiene_pdf: true,
}

const OK: InformeCorreo = { ...BASE, id: 2, nro_informe: '2026-1912-PC', ot: 'OT-QUI0051', estado: 'ok', hallazgos: [], ya_cargado: true }

function bandeja(informes: InformeCorreo[]): Bandeja {
  return {
    conteos: { todos: informes.length, rojo: 1, amarillo: 0, ok: 1, ya_cargado: 1 },
    informes,
    ultimo_sondeo: { iniciado_en: '2026-10-21T10:00:00Z', terminado_en: '2026-10-21T10:00:05Z', nuevos: 2, examinados: 5, error: null, dias: 14 },
  }
}

afterEach(() => vi.clearAllMocks())

describe('BandejaCorreo', () => {
  it('lista los informes con su estado y avisa lo más grave en la fila', async () => {
    listarBandeja.mockResolvedValue(bandeja([BASE, OK]))
    render(<BandejaCorreo />)
    expect(await screen.findByText('Quiteca · OT-QUI0053')).toBeInTheDocument()
    expect(screen.getByText('2026-1914-PC')).toBeInTheDocument()
    expect(screen.getByText('Seguimiento', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByText(/NO están en la lista/)).toBeInTheDocument()
    expect(screen.getByText('Ya cargado')).toBeInTheDocument()
    expect(screen.getByText('Todo calza con su solicitud.')).toBeInTheDocument()
  })

  it('filtrar por Seguimiento vuelve a pedir la bandeja con ese estado', async () => {
    listarBandeja.mockResolvedValue(bandeja([BASE]))
    render(<BandejaCorreo />)
    await screen.findByText('2026-1914-PC')
    fireEvent.click(screen.getByRole('button', { name: /Seguimiento/ }))
    await waitFor(() => expect(listarBandeja).toHaveBeenLastCalledWith('rojo', ''))
  })

  it('al abrir un informe muestra a quién debía llegar contra a quién llegó', async () => {
    listarBandeja.mockResolvedValue(bandeja([BASE]))
    const detalle: DetalleInformeCorreo = {
      ...BASE,
      para: ['patricio.caceres@unifrutti.com'],
      cc: ['juan.labarca@agrofresh.com'],
      bcc: ['agrofreshreporthub@gmail.com'],
      esperado: { to: ['contacto@agrovic.cl'], cc: ['juan.labarca@agrofresh.com'], bcc: [] },
      propios: ['agrofreshreporthub@gmail.com'],
    }
    detalleInformeCorreo.mockResolvedValue(detalle)
    render(<BandejaCorreo />)
    fireEvent.click(await screen.findByText('Quiteca · OT-QUI0053'))
    expect(await screen.findByText('contacto@agrovic.cl')).toBeInTheDocument()
    expect(screen.getByText('no llegó')).toBeInTheDocument()
    expect(screen.getByText('patricio.caceres@unifrutti.com')).toBeInTheDocument()
    expect(screen.getByText('no está en la lista')).toBeInTheDocument()
    // El buzón del Report Hub es nuestro: no se acusa como destinatario de más.
    expect(screen.queryByText('agrofreshreporthub@gmail.com')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ver el PDF' })).toBeInTheDocument()
  })

  it('«Revisar ahora» lee el buzón con los días elegidos y recarga la bandeja', async () => {
    listarBandeja.mockResolvedValue(bandeja([]))
    revisarCorreoAhora.mockResolvedValue({ examinados: 3, nuevos: 2, dias: 30 })
    render(<BandejaCorreo />)
    await screen.findByText(/Todavía no hay informes|Ningún informe/)
    fireEvent.change(screen.getByLabelText(/Últimos/), { target: { value: '30' } })
    fireEvent.click(screen.getByRole('button', { name: 'Revisar ahora' }))
    await waitFor(() => expect(revisarCorreoAhora).toHaveBeenCalledWith(30))
    expect(await screen.findByText(/3 correos nuevos revisados, 2 informes registrados/)).toBeInTheDocument()
    expect(listarBandeja.mock.calls.length).toBeGreaterThan(1)
  })

  it('si el servidor no pudo leer el buzón, lo dice', async () => {
    listarBandeja.mockResolvedValue(bandeja([]))
    revisarCorreoAhora.mockRejectedValue(new Error('Gmail rechazó el login IMAP'))
    render(<BandejaCorreo />)
    await screen.findByText(/Todavía no hay informes|Ningún informe/)
    fireEvent.click(screen.getByRole('button', { name: 'Revisar ahora' }))
    expect(await screen.findByText(/Gmail rechazó el login IMAP/)).toBeInTheDocument()
  })
})
