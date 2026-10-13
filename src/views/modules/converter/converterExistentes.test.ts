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

describe('revisión automática apenas se cargan los PDF', () => {
  type Inf = { archivo: string; laboratorio: string; existe?: unknown }
  const armar = (informes: Inf[], detalle: unknown[]) => {
    const ini = html.indexOf('let revisionExisten')
    const fin = html.indexOf('function pintarAvisoExisten')
    expect(ini).toBeGreaterThan(0)
    const tanda = html.slice(html.indexOf('function existentesDeLaTanda'), html.indexOf('/* ===== fin tanda'))
    const llamadas: string[] = []
    const f = new Function(
      'informes', 'llamarIngest', 'filaCruda', 'pintar',
      `${tanda}\n${html.slice(ini, fin)}\nreturn revisarExistentes`,
    )(
      informes,
      async (ruta: string) => { llamadas.push(ruta); return { detalle } },
      (i: Inf) => ({ Informe: i.archivo }),
      () => llamadas.push('pintar'),
    ) as () => Promise<void>
    return { f, llamadas }
  }

  it('marca los que ya existen y no escribe nada (solo la revisión previa)', async () => {
    const informes: Inf[] = [{ archivo: 'a.pdf', laboratorio: 'Quiteca' }, { archivo: 'b.pdf', laboratorio: 'Quiteca' }]
    const { f, llamadas } = armar(informes, [{ fila: 3, ya_existia: true, resultados_actuales: 5 }])
    await f()
    expect(informes[0].existe).toBeNull()
    expect(informes[1].existe).toBeTruthy()
    expect(llamadas).toEqual(['preview', 'pintar'])
  })

  it('se dispara al terminar de leer los PDF y el aviso ofrece quitarlos', () => {
    expect(html).toMatch(/pintar\(\);\n[ ]{2}}\n[ ]{2}revisarExistentes\(\);\n}/)
    expect(html).toContain('Quitar los ')
    expect(html).toContain('YA EXISTE')
  })
})
