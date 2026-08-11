import type { Sample } from '../types'

// Placeholder fixtures until the ETL/reporting backend is wired to httpClient.
const MOCK_SAMPLES: Sample[] = [
  {
    id: 's-2001',
    code: 'SMP-2026-0301',
    fruit: 'Cereza',
    origin: 'Valle del Maule',
    stage: 'in_analysis',
    receivedAt: '2026-08-09',
  },
  {
    id: 's-2002',
    code: 'SMP-2026-0302',
    fruit: 'Kiwi',
    origin: 'Región de Los Ríos',
    stage: 'received',
    receivedAt: '2026-08-10',
  },
  {
    id: 's-2003',
    code: 'SMP-2026-0303',
    fruit: 'Manzana Fuji',
    origin: 'Valle del Aconcagua',
    stage: 'completed',
    receivedAt: '2026-08-04',
  },
]

export async function fetchSamples(): Promise<Sample[]> {
  return MOCK_SAMPLES
}
