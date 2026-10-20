import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EnviosFallidosPanel } from './bloquesAdmin'

const envio = {
  tipo: 'Solicitud' as const, creado_en: new Date().toISOString(), referencia: 'OT-QUI0056', laboratorio: 'QUITECA',
  enviado_por: 'Jorge', error: 'Error SMTP al enviar correo: Connection unexpectedly closed',
}

describe('Widget «Envíos que fallaron»', () => {
  it('muestra cada envío fallido con su causa', () => {
    render(<EnviosFallidosPanel items={[envio]} cargando={false} />)
    expect(screen.getByText('OT-QUI0056')).toBeTruthy()
    expect(screen.getByText(/Connection unexpectedly closed/)).toBeTruthy()
  })

  it('sin fallos dice que todo salió bien', () => {
    render(<EnviosFallidosPanel items={[]} cargando={false} />)
    expect(screen.getByText(/Todo salió bien/)).toBeTruthy()
  })
})
