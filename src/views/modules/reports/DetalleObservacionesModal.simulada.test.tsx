import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { generarDatosSimulados } from '@/features/reportes/lib/simulacion'
import type { Observacion } from '@/features/reportes'
import { DetalleObservacionesModal } from './DetalleObservacionesModal'

describe('DetalleObservacionesModal con datos simulados', () => {
  it('abre la misma ficha del informe que ve un cliente, sin llamar al servidor ni mostrar límites', () => {
    const { filas, analitos, limites } = generarDatosSimulados(300, 5)
    const id = filas[0].solicitud_id
    const obs: Observacion[] = filas
      .filter((f) => f.solicitud_id === id)
      .map((f) => ({
        solicitudId: f.solicitud_id,
        nroSolicitud: f.nro_solicitud ?? '',
        ingrediente: f.ingrediente,
        ppm: f.valor_num == null ? null : Number(f.valor_num),
        valorTexto: f.valor_texto,
        fecha: f.fecha_muestreo,
        cliente: f.cliente,
        planta: f.planta,
        tipoAplicacion: f.tipo_aplicacion,
        tipoServicio: f.tipo_servicio,
        posicionMuestreo: f.posicion_muestreo,
        laboratorio: f.laboratorio,
        crop: f.especie,
        variedad: f.variedad,
        semana: f.semana_muestreo,
        mes: f.mes,
      }))
    render(<DetalleObservacionesModal titulo="SIM" filas={obs} onCerrar={() => {}} fichaCompleta={{ analitos, limites, sinLimites: true, simulada: true }} />)
    expect(screen.getByText('Datos del informe')).toBeInTheDocument()
    expect(screen.getByText('Resultados')).toBeInTheDocument()
    expect(screen.getByText('Informe simulado · sin PDF')).toBeInTheDocument()
    expect(screen.queryByText('Estado')).not.toBeInTheDocument()
  })
})
