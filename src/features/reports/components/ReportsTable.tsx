import { formatDate } from '@/lib/formatDate'
import type { Report } from '../types'
import { ReportStatusBadge } from './ReportStatusBadge'
import styles from './ReportsTable.module.css'

export function ReportsTable({ reports }: { reports: Report[] }) {
  if (reports.length === 0) {
    return <p className={styles.empty}>No hay reportes para mostrar.</p>
  }

  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Código</th>
          <th>Fruta</th>
          <th>Laboratorio</th>
          <th>Fecha</th>
          <th>Estado</th>
        </tr>
      </thead>
      <tbody>
        {reports.map((report) => (
          <tr key={report.id}>
            <td>{report.code}</td>
            <td>{report.fruit}</td>
            <td>{report.laboratory}</td>
            <td>{formatDate(report.createdAt)}</td>
            <td>
              <ReportStatusBadge status={report.status} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
