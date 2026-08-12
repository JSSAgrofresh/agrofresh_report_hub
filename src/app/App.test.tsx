import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from './App'

describe('App', () => {
  it('renders the dashboard view by default', async () => {
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Panel general' })).toBeInTheDocument()
  })
})
