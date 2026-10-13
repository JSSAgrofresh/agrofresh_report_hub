/**
 * Converter avisa cuando se sube algo que ya existe en el sistema y deja elegir:
 * subir y actualizar, o sacarlo de la tanda (public/modules/converter.html).
 */
import { describe, expect, it } from 'vitest'
import html from '../../../../public/modules/converter.html?raw'

type Informe = { archivo: string }
type Detalle = { fila?: number; ya_existia?: boolean; omitida?: boolean }
const cargar = () => {
  const ini = html.indexOf('/* ===== tanda: informes que ya existen')
  const fin = html.indexOf('/* ===== fin tanda =====')
  expect(ini).toBeGreaterThan(0)
  expect(fin).toBeGreaterThan(ini)
  return new Function(`${html.slice(ini, fin)}\nreturn existentesDeLaTanda`)() as (d: Detalle[], ok: Informe[]) => { inf: Informe; d: Detalle }[]
}

describe('informes que ya existen en la tanda', () => {
  const ok = [{ archivo: 'a.pdf' }, { archivo: 'b.pdf' }, { archivo: 'c.pdf' }]

  it('empareja cada aviso del servidor con su informe (fila = posición + 2)', () => {
    const f = cargar()
    const r = f([{ fila: 2, ya_existia: false }, { fila: 3, ya_existia: true }, { fila: 4, ya_existia: true }], ok)
    expect(r.map((x) => x.inf.archivo)).toEqual(['b.pdf', 'c.pdf'])
  })

  it('ignora filas omitidas, sin fila o fuera de la tanda', () => {
    const f = cargar()
    expect(f([{ fila: 2, ya_existia: true, omitida: true }, { ya_existia: true }, { fila: 9, ya_existia: true }], ok)).toEqual([])
    expect(f([], ok)).toEqual([])
  })
})

describe('el botón «Subir» pregunta antes de seguir', () => {
  it('ofrece actualizar o sacar de la tanda, y manda la elección al servidor', () => {
    expect(html).toContain('Subir y actualizar los datos')
    expect(html).toContain('Sacarlos de la tanda')
    expect(html).toContain('actualizar_existentes: !!actualizar')
  })
})
