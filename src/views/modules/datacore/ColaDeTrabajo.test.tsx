import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { InformeCorreo } from '@/features/correoInformes'
import { ColaDeTrabajo } from './ColaDeTrabajo'
import { INFORME_OK, INFORME_ROJO } from './fixturesIngreso'

const { aceptarInforme, aceptarVarios, marcarInformado } = vi.hoisted(() => ({
  aceptarInforme: vi.fn(),
  aceptarVarios: vi.fn(),
  marcarInformado: vi.fn(),
}))

vi.mock('@/features/correoInformes', async () => {
  const real = await vi.importActual<typeof import('@/features/correoInformes')>('@/features/correoInformes')
  return { ...real, aceptarInforme, aceptarVarios, marcarInformado }
})

const LISTO = { ...INFORME_OK, id: 31, decision: 'pendiente' as const, es_ultima_copia: true, estado: 'ok' as const, ya_cargado: false, hallazgos: [] }
const LISTO2 = { ...LISTO, id: 32, nro_informe: '2026-2000-PC' }
const MAL = { ...INFORME_ROJO, id: 33, decision: 'pendiente' as const, es_ultima_copia: true, informado: false, resuelto_en: null }
const NO_HOMO = {
  ...LISTO, id: 34, nro_informe: '2026-3000-PC', estado: 'amarillo' as const,
  hallazgos: [{ nivel: 'amarillo' as const, codigo: 'no_homogeneo', texto: 'Hay que homogeneizar' }],
}

type Grupos = ('listo' | 'homogeneizar' | 'seguimiento' | 'revisar' | 'informado')[]

function cola(informes: InformeCorreo[], grupos: Grupos, onAbrir = vi.fn()) {
  return render(<ColaDeTrabajo informes={informes} error={null} grupos={grupos} onCambio={() => {}} onAbrir={onAbrir} vacio="Nada" />)
}

afterEach(() => vi.clearAllMocks())

describe('ColaDeTrabajo', () => {
  it('cada widget muestra solo sus bloques y acepta de una vez todos los listos', async () => {
    cola([LISTO, LISTO2, MAL], ['listo'])
    expect(screen.getByText('Listos para aceptar')).toBeInTheDocument()
    expect(screen.queryByText('Salió mal: hay que avisar al laboratorio')).not.toBeInTheDocument()
    aceptarVarios.mockResolvedValue({ aceptados: [{ id: 31, resultado: 'cargado', carga_id: 1, envio_al_cliente: 'marcado', avisos: [] }], errores: [] })
    fireEvent.click(screen.getByRole('button', { name: /Aceptar todos \(2\)/ }))
    await waitFor(() => expect(aceptarVarios).toHaveBeenCalledWith([31, 32]))
  })

  it('desmarcar un listo lo deja fuera del lote', async () => {
    aceptarVarios.mockResolvedValue({ aceptados: [], errores: [] })
    cola([LISTO, LISTO2], ['listo'])
    fireEvent.click(screen.getByLabelText(`Elegir ${LISTO.nro_informe}`))
    fireEvent.click(screen.getByRole('button', { name: /Aceptar los elegidos \(1\)/ }))
    await waitFor(() => expect(aceptarVarios).toHaveBeenCalledWith([32]))
  })

  it('un informe por homogeneizar se abre para corregirlo, no se acepta a ciegas', () => {
    const onAbrir = vi.fn()
    cola([NO_HOMO], ['homogeneizar'], onAbrir)
    expect(screen.queryByRole('button', { name: 'Aceptar' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Homogeneizar' }))
    expect(onAbrir).toHaveBeenCalledWith(NO_HOMO)
  })

  it('«Ya informé» se anota en la misma fila, sin abrir el detalle', async () => {
    marcarInformado.mockResolvedValue({ ok: true })
    cola([MAL], ['seguimiento'])
    fireEvent.click(screen.getByRole('button', { name: 'Ya informé' }))
    fireEvent.change(screen.getByLabelText(/A quién se avisó/), { target: { value: 'Avisé a Quiteca' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(marcarInformado).toHaveBeenCalledWith(33, 'Avisé a Quiteca'))
  })

  it('un envío malo no se puede cargar: solo se informa, se resuelve o se rechaza', () => {
    cola([MAL], ['seguimiento'])
    expect(screen.queryByRole('button', { name: /Cargar de todas formas|Aceptar/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ya informé' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Resolver' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rechazar' })).toBeInTheDocument()
  })

  it('un fallo al aceptar sale bajo su fila', async () => {
    aceptarInforme.mockRejectedValue(new Error('No calza con Listados'))
    cola([LISTO], ['listo'])
    fireEvent.click(screen.getAllByRole('button', { name: 'Aceptar' })[0])
    expect(await screen.findByText('No calza con Listados')).toBeInTheDocument()
  })
})
