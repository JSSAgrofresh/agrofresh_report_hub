import { describe, expect, it } from 'vitest'
import { resaltarFranja } from './resaltarFranja'
import type { DatasetFranja } from './resaltarFranja'

const colorDe = (a: string) => (a === 'FDL' ? '#f0a000' : '#1f9a3a')
const base = (): DatasetFranja[] => [
  { label: 'FDL' }, // punto: no se toca
  { label: 'FDL mín' }, { label: 'FDL máx' }, { label: 'PYR mín' }, { label: 'PYR máx' },
]

describe('resaltarFranja', () => {
  it('engrosa las líneas del analito elegido y apaga las demás', () => {
    const d = base()
    resaltarFranja(d, 1, 'FDL', colorDe)
    expect(d[0].borderWidth).toBeUndefined()
    expect(d[1]).toMatchObject({ borderColor: '#f0a000', borderWidth: 3.6, borderDash: [] })
    expect(d[2].borderWidth).toBe(3.6)
    expect(d[3]).toMatchObject({ borderColor: '#1f9a3a2e', borderWidth: 1 })
  })
  it('sin analito todo vuelve al estilo normal', () => {
    const d = base()
    resaltarFranja(d, 1, 'FDL', colorDe)
    resaltarFranja(d, 1, null, colorDe)
    expect(d[1]).toMatchObject({ borderColor: '#f0a00099', borderWidth: 1.4, borderDash: [6, 4] })
    expect(d[3]).toMatchObject({ borderColor: '#1f9a3a99', borderWidth: 1.4 })
  })
})
