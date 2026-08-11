import { Badge } from '@/components/ui/Badge'
import type { ReportStatus } from '../types'

const STATUS_LABEL: Record<ReportStatus, string> = {
  approved: 'Aprobado',
  pending: 'Pendiente',
  rejected: 'Rechazado',
}

const STATUS_TONE: Record<ReportStatus, 'success' | 'warning' | 'danger'> = {
  approved: 'success',
  pending: 'warning',
  rejected: 'danger',
}

export function ReportStatusBadge({ status }: { status: ReportStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
}
