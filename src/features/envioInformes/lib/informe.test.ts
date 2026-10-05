import { describe, expect, it } from 'vitest'
import { datosCorreo, enviable, etiquetaServicio, motivoBloqueo, nuevoInforme, sinRepetidos } from './informe'
import type { LecturaInforme } from './tipos'

const lectura = (extra: Partial<LecturaInforme> = {}): LecturaInforme => ({
  nombre: 'a.pdf', leido: true, error: null, sold_to: 'MULTIFRUTA SA', ship_to: 'GESEX PLANTA FATIMA',
  especie: 'Naranja', tipo_aplicacion: 'Línea de proceso', numero_solicitud: 'OT-AGF0075', servicio: '',
  plan: { to: ['a@x.cl'], cc: [], bcc: ['p@x.cl'], sin_lista: false, especies: [] }, ...extra,
})
const pdf = (nombre = 'a.pdf', tam = 3) => new File(['x'.repeat(tam)], nombre, { type: 'application/pdf' })

describe('nuevoInforme', () => {
  it('parte con lo leído del PDF y la lista propuesta', () => {
    const inf = nuevoInforme(pdf(), lectura())
    expect(inf).toMatchObject({ soldTo: 'MULTIFRUTA SA', shipTo: 'GESEX PLANTA FATIMA', especie: 'Naranja', para: ['a@x.cl'], bcc: ['p@x.cl'] })
    expect(inf.asunto).toBeNull()
    expect(motivoBloqueo(inf)).toBeNull()
    expect(enviable(inf)).toBe(true)
  })

  it('dos informes no comparten identidad', () => {
    expect(nuevoInforme(pdf(), lectura()).id).not.toBe(nuevoInforme(pdf(), lectura()).id)
  })
})

describe('motivoBloqueo', () => {
  it('un PDF que no se pudo leer no se envía', () => {
    const inf = nuevoInforme(pdf(), lectura({ leido: false, sold_to: '', ship_to: '', plan: null, error: 'No es un PDF' }))
    expect(motivoBloqueo(inf)).toMatch(/Sold To y el Ship To/)
    expect(enviable(inf)).toBe(false)
  })

  it('sin lista pide escribir un correo', () => {
    const inf = nuevoInforme(pdf(), lectura({ plan: { to: [], cc: [], bcc: [], sin_lista: true, especies: [] } }))
    expect(motivoBloqueo(inf)).toMatch(/Sin lista/)
  })

  it('un correo mal escrito frena solo a ese informe', () => {
    const inf = { ...nuevoInforme(pdf(), lectura()), cc: ['roto'] }
    expect(motivoBloqueo(inf)).toBe('Correo inválido: roto')
  })

  it('uno ya enviado no se reenvía solo; uno con error se puede reintentar', () => {
    const inf = nuevoInforme(pdf(), lectura())
    expect(enviable({ ...inf, estado: 'enviado' })).toBe(false)
    expect(enviable({ ...inf, estado: 'error' })).toBe(true)
    expect(enviable({ ...inf, estado: 'enviando' })).toBe(false)
  })
})

describe('datosCorreo y sinRepetidos', () => {
  it('manda el laboratorio fijo y lo corregido de ESE informe', () => {
    const inf = { ...nuevoInforme(pdf(), lectura()), asunto: 'Mío' }
    expect(datosCorreo(inf, 'AGROFRESH')).toMatchObject({
      laboratorio: 'AGROFRESH', sold_to: 'MULTIFRUTA SA', asunto: 'Mío', cuerpo: null,
    })
  })

  it('no repite un archivo ya subido ni dentro del mismo lote', () => {
    const existente = nuevoInforme(pdf('a.pdf', 3), lectura())
    const nuevos = sinRepetidos([existente], [pdf('a.pdf', 3), pdf('b.pdf', 3), pdf('b.pdf', 3), pdf('a.pdf', 9)])
    expect(nuevos.map((f) => `${f.name}:${f.size}`)).toEqual(['b.pdf:3', 'a.pdf:9'])
  })
})

describe('etiquetaServicio', () => {
  it.each([['', 'Línea de proceso'], ['actimist', 'Actimist'], ['ecofog', 'Ecofog'], ['otro', 'Línea de proceso']])(
    '%s → %s', (s, e) => expect(etiquetaServicio(s)).toBe(e),
  )
})
