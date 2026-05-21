import type { RefineProfile } from '@/components/playce/the-refine'

/** Map recommendation difficulty text to questionnaire skill tiers. */
export function difficultyToSkillLevel(difficulty?: string): RefineProfile['skillLevel'] {
  const d = (difficulty ?? '').toLowerCase()
  if (d.includes('beginner') || d.includes('easy')) return 'BEGINNER'
  if (d.includes('elite') || d.includes('world-class') || d.includes('expert')) return 'ELITE'
  if (d.includes('pro') || d.includes('advanced') || d.includes('hard')) return 'PRO'
  return 'INTERMEDIATE'
}

export function refineWithLocationSkill(base: RefineProfile, difficulty?: string): RefineProfile {
  return { ...base, skillLevel: difficultyToSkillLevel(difficulty) }
}
