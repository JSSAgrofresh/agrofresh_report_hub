import { describe, expect, it } from 'vitest'
import { etiquetarTablas } from './apilarTablas'

function tabla(atributo: string) {
  const div = document.createElement('div')
  div.innerHTML = `<table ${atributo}><thead><tr><th>Equipo</th><th>Peso 1 <span>(g)</span></th><th>Obs.</th></tr></thead>
    <tbody><tr><td>P-01</td><td>0,1</td><td>ok</td></tr></tbody></table>`
  return div
}

describe('etiquetarTablas', () => {
  it('copia el encabezado a cada celda, salvo la primera (el título)', () => {
    const div = tabla('data-apilar')
    etiquetarTablas(div)
    const celdas = Array.from(div.querySelectorAll('td')).map((c) => c.dataset.label)
    expect(celdas).toEqual(['', 'Peso 1 (g)', 'Obs.'])
  })

  it('no toca tablas sin la marca', () => {
    const div = tabla('')
    etiquetarTablas(div)
    expect(div.querySelector('td')?.dataset.label).toBeUndefined()
  })
})
