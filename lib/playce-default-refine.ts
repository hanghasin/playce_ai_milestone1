import { normalizeTripRole, type RefineProfile } from '@/components/playce/the-refine'

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

/** Merge partial session/handoff refine with safe defaults (Confirm / Matrix). */
export function resolveRefineProfile(raw?: Partial<RefineProfile> | null): RefineProfile {
  return {
    skillLevel: raw?.skillLevel ?? PLAYCE_DEFAULT_REFINE.skillLevel,
    riskAppetite: raw?.riskAppetite ?? PLAYCE_DEFAULT_REFINE.riskAppetite,
    budgetRange: raw?.budgetRange ?? PLAYCE_DEFAULT_REFINE.budgetRange,
    tripFocus: raw?.tripFocus ?? PLAYCE_DEFAULT_REFINE.tripFocus,
    duration: raw?.duration ?? PLAYCE_DEFAULT_REFINE.duration,
    travelCompany: raw?.travelCompany ?? PLAYCE_DEFAULT_REFINE.travelCompany,
    tripRole: normalizeTripRole(raw?.tripRole) ?? raw?.tripRole ?? PLAYCE_DEFAULT_REFINE.tripRole,
  }
}
