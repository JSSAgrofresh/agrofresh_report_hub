import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FijosDeLista } from './FijosDeLista'

describe('FijosDeLista', () => {
  it('RYD muestra a Carla y Fran en Para y a Jorge y el sistema en copia', () => {
    render(<FijosDeLista servicio="ryd" fijos={{ para: ['CCACERES@AGROFRESH.COM', 'FGONZALEZ@AGROFRESH.COM'], cc: ['JORGE.SANDOVAL@AGROFRESH.COM', 'AGROFRESHREPORTHUB@GMAIL.COM'], respaldo: [] }} />)
    expect(screen.getByText(/Siempre reciben \(RYD\)/)).toBeInTheDocument()
    expect(screen.getByTitle('CCACERES@AGROFRESH.COM')).toHaveTextContent('CCACERES')
    expect(screen.getByTitle('AGROFRESHREPORTHUB@GMAIL.COM')).toBeInTheDocument()
  })

  it('Línea de proceso solo dice su respaldo para cuando no hay lista del cliente', () => {
    render(<FijosDeLista servicio="linea" fijos={{ para: [], cc: [], respaldo: ['JORGE.SANDOVAL@AGROFRESH.COM', 'CGUERRERO@AGROFRESH.COM'] }} />)
    expect(screen.getByText(/Sin lista del cliente/)).toBeInTheDocument()
    expect(screen.getByTitle('CGUERRERO@AGROFRESH.COM')).toBeInTheDocument()
  })
})
