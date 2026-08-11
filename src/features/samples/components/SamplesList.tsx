import { Card } from '@/components/ui/Card'
import { formatDate } from '@/lib/formatDate'
import type { Sample } from '../types'
import { SampleStageBadge } from './SampleStageBadge'
import styles from './SamplesList.module.css'

export function SamplesList({ samples }: { samples: Sample[] }) {
  if (samples.length === 0) {
    return <p className={styles.empty}>No hay muestras para mostrar.</p>
  }

  return (
    <div className={styles.list}>
      {samples.map((sample) => (
        <Card key={sample.id} className={styles.item}>
          <div className={styles.itemHeader}>
            <span className={styles.code}>{sample.code}</span>
            <SampleStageBadge stage={sample.stage} />
          </div>
          <p className={styles.fruit}>{sample.fruit}</p>
          <p className={styles.meta}>
            {sample.origin} · Recibida el {formatDate(sample.receivedAt)}
          </p>
        </Card>
      ))}
    </div>
  )
}
