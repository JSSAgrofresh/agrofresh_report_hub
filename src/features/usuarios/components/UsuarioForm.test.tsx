import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { UsuarioForm } from './UsuarioForm'
import type { Usuario } from '../types'

vi.mock('@/features/catalogo', () => ({
  listarClientes: vi.fn().mockResolvedValue([]),
  listarPlantas: vi.fn().mockResolvedValue([]),
}))

const cuenta: Usuario = {
  id: '9', email: 'toma@agrofresh.com', nombre: 'Toma', tipoAcceso: 'admin_area', area: 'cromatografia',
}

function guardar(usuario: Usuario, antes?: () => void) {
  const onGuardar = vi.fn()
  render(<UsuarioForm usuario={usuario} onGuardar={onGuardar} onCancelar={() => {}} />)
  antes?.()
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
  return onGuardar
}

describe('UsuarioForm: secciones de AgroFresh Lab', () => {
  it('con las tres marcadas no guarda nada especial (la cuenta sigue viendo todo)', () => {
    const onGuardar = guardar(cuenta)
    const { modulos } = onGuardar.mock.calls[0][0] as { modulos: string[] }
    expect(modulos).toContain('agrofresh_lab')
    expect(modulos.some((m) => m.startsWith('lab_'))).toBe(false)
  })

  it('al desmarcar «Verificaciones diarias» se guardan solo las otras dos', () => {
    const onGuardar = guardar(cuenta, () => fireEvent.click(screen.getByRole('checkbox', { name: /Verificaciones diarias/ })))
    const { modulos } = onGuardar.mock.calls[0][0] as { modulos: string[] }
    expect(modulos).toEqual(expect.arrayContaining(['agrofresh_lab', 'lab_ingreso', 'lab_envio']))
    expect(modulos).not.toContain('lab_verificaciones')
  })

  it('una cuenta que ya tenía secciones elegidas las muestra marcadas tal cual', () => {
    render(
      <UsuarioForm
        usuario={{ ...cuenta, modulos: ['agrofresh_lab', 'lab_ingreso'] }}
        onGuardar={() => {}}
        onCancelar={() => {}}
      />,
    )
    expect((screen.getByRole('checkbox', { name: /Ingreso al laboratorio/ }) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByRole('checkbox', { name: /Verificaciones diarias/ }) as HTMLInputElement).checked).toBe(false)
  })

  it('no deja guardar con AgroFresh Lab activo y ninguna sección', () => {
    const onGuardar = guardar(cuenta, () => {
      for (const n of [/Ingreso al laboratorio/, /Verificaciones diarias/, /Envío de informes/]) {
        fireEvent.click(screen.getByRole('checkbox', { name: n }))
      }
    })
    expect(onGuardar).not.toHaveBeenCalled()
    expect(screen.getByText(/al menos una sección de AgroFresh Lab/)).toBeTruthy()
  })
})
