import { describe, expect, it } from 'vitest'
import { puedeEditarSegunEnvio } from './envioAutomatico'

// Línea de proceso se envía sola; Actimist se guarda y se envía a mano.
const cfg = { activo: true, por_tipo: { Actimist: false } }
const cuenta = (tipoAcceso: string, modulos?: string[]) => ({ tipoAcceso, modulos })

describe('puedeEditarSegunEnvio', () => {
  it('el administrador general edita todo', () => {
    expect(puedeEditarSegunEnvio(cuenta('admin_general'), cfg, 'Línea de proceso', false)).toBe(true)
  })

  it('sin la función nadie más edita, ni siquiera un tipo que se envía a mano', () => {
    expect(puedeEditarSegunEnvio(cuenta('admin_area', ['toma_muestras']), cfg, 'Actimist', false)).toBe(false)
    expect(puedeEditarSegunEnvio(cuenta('muestreador'), cfg, 'Actimist', false)).toBe(false)
  })

  it('con la función edita un tipo que se guarda y se envía a mano', () => {
    expect(puedeEditarSegunEnvio(cuenta('admin_area', ['toma_editar']), cfg, 'Actimist', false)).toBe(true)
  })

  it('con la función no edita un tipo que se envía solo', () => {
    expect(puedeEditarSegunEnvio(cuenta('admin_area', ['toma_editar']), cfg, 'Línea de proceso', false)).toBe(false)
  })

  it('una solicitud de prueba nunca se envía sola: se puede editar con la función', () => {
    expect(puedeEditarSegunEnvio(cuenta('admin_area', ['toma_editar']), cfg, 'Línea de proceso', true)).toBe(true)
  })

  it('gerencia, comerciales y clientes nunca, aunque la traigan guardada', () => {
    for (const t of ['gerencia', 'cliente', 'comercial']) {
      expect(puedeEditarSegunEnvio(cuenta(t, ['toma_editar']), cfg, 'Actimist', false)).toBe(false)
    }
  })
})
