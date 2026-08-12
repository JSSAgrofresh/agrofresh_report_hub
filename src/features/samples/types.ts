import type { ID } from '@/types'

export type SampleStage = 'received' | 'in_analysis' | 'completed'

export interface Sample {
  id: ID
  code: string
  fruit: string
  origin: string
  stage: SampleStage
  receivedAt: string
}
