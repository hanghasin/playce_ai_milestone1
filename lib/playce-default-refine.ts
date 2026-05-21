import type { RefineProfile } from '@/components/playce/the-refine'

/** Baseline questionnaire state before travellers adjust calibration chips. */
export const PLAYCE_DEFAULT_REFINE: RefineProfile = {
  skillLevel: 'INTERMEDIATE',
  riskAppetite: 'ADVENTURE',
  budgetRange: 'MID-RANGE',
  tripFocus: 'EXPLORE',
  duration: 'WEEK',
  travelCompany: 'SOLO',
  tripRole: null,
}
