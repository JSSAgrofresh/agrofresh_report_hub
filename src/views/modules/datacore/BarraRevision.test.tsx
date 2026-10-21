import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { BarraRevision } from './BarraRevision'
import type { UltimoSondeo } from '@/features/correoInformes'

const { revisarCorreoAhora } = vi.hoisted(() => ({ revisarCorreoAhora: vi.fn() }))

vi.mock('@/features/correoInformes', async () => {
  const real = await vi.importActual<typeof import('@/features/correoInformes')>('@/features/correoInformes')
  return { ...real, revisarCorreoAhora }
})

const sondeo = (terminado: string | null, nuevos: number, error: string | null = null): UltimoSondeo => ({
  id: 9, iniciado_en: '2026-10-21T15:00:00Z', terminado_en: terminado, nuevos, examinados: nuevos + 1, error, dias: 30,
})

afterEach(() => vi.clearAllMocks())

describe('BarraRevision', () => {
  it('arranca la revisión con los días elegidos, muestra el avance y al terminar avisa', async () => {
    revisarCorreoAhora.mockResolvedValue({ id: 9, en_curso: true, ya_estaba_en_curso: false })
    const leerUltimo = vi.fn().mockResolvedValueOnce(sondeo(null, 1)).mockResolvedValue(sondeo('2026-10-21T15:02:00Z', 2))
    const onTerminada = vi.fn()
    render(<BarraRevision ultimo={null} leerUltimo={leerUltimo} onTerminada={onTerminada} intervaloMs={0} />)
    fireEvent.change(screen.getByLabelText(/Últimos/), { target: { value: '30' } })
    fireEvent.click(screen.getByRole('button', { name: 'Recibir informes ahora' }))
    await waitFor(() => expect(revisarCorreoAhora).toHaveBeenCalledWith(30, false))
    expect(await screen.findByText(/3 correos nuevos revisados, 2 informes registrados/)).toBeInTheDocument()
    expect(onTerminada).toHaveBeenCalled()
  })

  it('si el servidor no pudo arrancar la revisión, lo dice', async () => {
    revisarCorreoAhora.mockRejectedValue(new Error('Faltan GMAIL_ACCOUNT y GMAIL_APP_PASSWORD en el .env del servidor.'))
    render(<BarraRevision ultimo={null} leerUltimo={vi.fn()} onTerminada={() => {}} intervaloMs={0} />)
    fireEvent.click(screen.getByRole('button', { name: 'Recibir informes ahora' }))
    expect(await screen.findByText(/Faltan GMAIL_ACCOUNT/)).toBeInTheDocument()
  })

  it('si la revisión terminó con error del buzón, lo muestra', async () => {
    revisarCorreoAhora.mockResolvedValue({ id: 9, en_curso: true, ya_estaba_en_curso: false })
    const leerUltimo = vi.fn().mockResolvedValue(sondeo('2026-10-21T15:00:03Z', 0, 'Gmail rechazó el login IMAP'))
    render(<BarraRevision ultimo={null} leerUltimo={leerUltimo} onTerminada={() => {}} intervaloMs={0} />)
    fireEvent.click(screen.getByRole('button', { name: 'Recibir informes ahora' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Gmail rechazó el login IMAP')
  })

  it('con una revisión en curso el botón sigue activo y la reinicia a la fuerza (nunca queda bloqueado)', async () => {
    revisarCorreoAhora.mockResolvedValue({ id: 11, en_curso: true, ya_estaba_en_curso: false })
    const reciente = { ...sondeo(null, 0), iniciado_en: new Date().toISOString() }
    render(<BarraRevision ultimo={reciente} leerUltimo={vi.fn().mockResolvedValue(reciente)} onTerminada={() => {}} intervaloMs={1000} />)
    const boton = screen.getByRole('button', { name: 'Reiniciar y recibir ahora' })
    expect(boton).toBeEnabled()
    fireEvent.click(boton)
    await waitFor(() => expect(revisarCorreoAhora).toHaveBeenCalledWith(14, true))
  })

  it('una revisión que lleva horas «en curso» quedó colgada y se avisa', () => {
    render(<BarraRevision ultimo={sondeo(null, 0)} leerUltimo={vi.fn()} onTerminada={() => {}} />)
    expect(screen.getByText(/quedó colgada/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reiniciar y recibir ahora' })).toBeEnabled()
  })

  it('si otra pestaña ya terminó la revisión, avisa para releer', async () => {
    const leerUltimo = vi.fn().mockResolvedValue(sondeo('2026-10-21T15:02:00Z', 2))
    const onTerminada = vi.fn()
    const reciente = { ...sondeo(null, 1), iniciado_en: new Date().toISOString() }
    render(<BarraRevision ultimo={reciente} leerUltimo={leerUltimo} onTerminada={onTerminada} intervaloMs={5} />)
    await waitFor(() => expect(onTerminada).toHaveBeenCalled())
  })

  it('sin revisiones previas lo dice', () => {
    render(<BarraRevision ultimo={null} leerUltimo={vi.fn()} onTerminada={() => {}} />)
    expect(screen.getByText('El correo todavía no se ha revisado.')).toBeInTheDocument()
  })
})
