import type { ID } from '@/types'

export type ReportStatus = 'pending' | 'approved' | 'rejected'

export interface Report {
  id: ID
  code: string
  fruit: string
  laboratory: string
  status: ReportStatus
  createdAt: string
}
