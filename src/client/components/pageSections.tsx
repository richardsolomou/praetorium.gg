import { buttonClass } from './buttonClass'

type Section = { missing: string; explanation: string; home: string; label: string }

const HOME: Section = {
  missing: 'Nothing here',
  explanation: "This page doesn't exist. Check the link, or start again from home.",
  home: '/',
  label: 'Go home',
}

/** What a missing page was, by its address's first segment, and the list its reader goes back to. */
const SECTIONS: Record<string, Section> = {
  battles: {
    missing: 'No such battle',
    explanation: "This battle was deleted, or it isn't shared with you.",
    home: '/battles',
    label: 'Your battles',
  },
  rosters: {
    missing: 'No such roster',
    explanation: 'This roster was deleted, or you no longer have access to it.',
    home: '/rosters',
    label: 'Your rosters',
  },
  groups: { missing: 'No such group', explanation: "This group was deleted, or you aren't in it.", home: '/groups', label: 'Your groups' },
  tournaments: {
    missing: 'No such tournament',
    explanation: "This tournament was deleted, or it isn't shared with you.",
    home: '/tournaments',
    label: 'Tournaments',
  },
  leagues: {
    missing: 'No such league',
    explanation: "This league was deleted, or it isn't shared with you.",
    home: '/leagues',
    label: 'Leagues',
  },
  factions: {
    missing: 'Not in the current data',
    explanation: "This faction or datasheet isn't in the current data.",
    home: '/factions',
    label: 'All factions',
  },
  rules: {
    missing: 'Not in the current data',
    explanation: "This rules document or section isn't in the current data.",
    home: '/rules',
    label: 'Rules',
  },
  missions: {
    missing: 'Not in the current data',
    explanation: "This mission isn't in the current data.",
    home: '/missions',
    label: 'Missions',
  },
  'force-dispositions': {
    missing: 'Not in the current data',
    explanation: "This Force disposition isn't in the current data.",
    home: '/force-dispositions',
    label: 'Force dispositions',
  },
  docs: { missing: 'No such guide', explanation: 'This guide was moved or removed.', home: '/docs', label: 'All guides' },
  guides: { missing: 'No such guide', explanation: 'This guide was moved or removed.', home: '/docs', label: 'All guides' },
  'data-updates': {
    missing: 'Not in the current data',
    explanation: "This faction isn't in the current data.",
    home: '/data-updates',
    label: 'Data updates',
  },
}

export const pageSection = (pathname: string): Section => SECTIONS[pathname.split('/')[1] ?? ''] ?? HOME

/** The way back to the list a page belongs to, beside whatever else its state offers; a full load, so it also recovers a page that failed. */
export function SectionLink({ section, variant = 'outline' }: { section: Section; variant?: 'outline' | 'default' }) {
  return (
    <a href={section.home} className={buttonClass({ variant })}>
      {section.label}
    </a>
  )
}
