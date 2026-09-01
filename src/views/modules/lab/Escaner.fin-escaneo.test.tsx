import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Escaner } from './Escaner'

describe('Escaner de código libre', () => {
  afterEach(() => vi.useRealTimers())

  it('espera el código completo y conserva GCNPD10065, no solamente el 5', () => {
    vi.useFakeTimers()
    const encontrado = vi.fn()
    render(
      <Escaner
        buscar={(codigo) => ({ codigo })}
        onEncontrado={encontrado}
        placeholder="Escanea el n° de muestra"
        mensajeNoEncontrado={() => ''}
        esperaFinEscaneoMs={80}
      />,
    )
    const campo = screen.getByLabelText('Escanea el n° de muestra')
    for (const parcial of ['G', 'GC', 'GCN', 'GCNP', 'GCNPD', 'GCNPD1', 'GCNPD10', 'GCNPD100', 'GCNPD1006', 'GCNPD10065']) {
      fireEvent.change(campo, { target: { value: parcial } })
    }
    expect(encontrado).not.toHaveBeenCalled()
    vi.advanceTimersByTime(80)
    expect(encontrado).toHaveBeenCalledTimes(1)
    expect(encontrado).toHaveBeenCalledWith({ codigo: 'GCNPD10065' })
    expect((campo as HTMLInputElement).value).toBe('GCNPD10065')
  })
})
