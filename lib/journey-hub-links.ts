import type { HubLinkItem } from '@/components/playce/JourneyMissionBriefingPanel'

/** Same preset vs user split as JourneyMissionBriefingPanel HubSection. */
export function splitHubLinksForDisplay(links: HubLinkItem[]): {
  presetLinks: HubLinkItem[]
  userLinks: HubLinkItem[]
} {
  return {
    presetLinks: links.filter(
      (link) => !link.id.startsWith('manual-') && !link.id.startsWith('user-')
    ),
    userLinks: links.filter(
      (link) => link.id.startsWith('manual-') || link.id.startsWith('user-')
    ),
  }
}
