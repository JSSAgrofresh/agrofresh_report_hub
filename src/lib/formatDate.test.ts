import { describe, expect, it } from 'vitest'
import { formatDate } from './formatDate'

describe('formatDate', () => {
  it('formats an ISO date string in es-CL', () => {
    expect(formatDate('2026-08-11')).toBe('11 ago 2026')
  })
})
