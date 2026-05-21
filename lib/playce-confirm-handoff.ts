import type { RefineProfile } from '@/components/playce/the-refine'
import type { MatrixLocationData } from '@/lib/playce-location-types'

/** Session key for Calibration → Confirm handoff (`app/confirm/...`). */
export const PLAYCE_CONFIRM_HANDOFF_KEY = 'playce-confirm-handoff'

export type PlayceConfirmHandoff = {
  v: 1
  destinationId: string
  location: MatrixLocationData
  refine: RefineProfile
  timeframeQuery: string
}
