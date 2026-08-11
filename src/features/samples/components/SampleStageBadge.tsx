import { Badge } from '@/components/ui/Badge'
import type { SampleStage } from '../types'

const STAGE_LABEL: Record<SampleStage, string> = {
  received: 'Recibida',
  in_analysis: 'En análisis',
  completed: 'Completada',
}

const STAGE_TONE: Record<SampleStage, 'neutral' | 'warning' | 'success'> = {
  received: 'neutral',
  in_analysis: 'warning',
  completed: 'success',
}

export function SampleStageBadge({ stage }: { stage: SampleStage }) {
  return <Badge tone={STAGE_TONE[stage]}>{STAGE_LABEL[stage]}</Badge>
}
