import type { Report } from '../types'

// Placeholder fixtures until the ETL/reporting backend is wired to httpClient.
const MOCK_REPORTS: Report[] = [
  {
    id: 'r-1001',
    code: 'RPT-2026-0142',
    fruit: 'Manzana Gala',
    laboratory: 'Laboratorio Interno',
    status: 'approved',
    createdAt: '2026-08-05',
  },
  {
    id: 'r-1002',
    code: 'RPT-2026-0143',
    fruit: 'Uva Red Globe',
    laboratory: 'Eurofins',
    status: 'pending',
    createdAt: '2026-08-08',
  },
  {
    id: 'r-1003',
    code: 'RPT-2026-0144',
    fruit: 'Arándano',
    laboratory: 'Laboratorio Interno',
    status: 'rejected',
    createdAt: '2026-08-10',
  },
]

export async function fetchReports(): Promise<Report[]> {
  return MOCK_REPORTS
}
