import { useId, type ReactNode } from 'react'
import type { AchievementMetric, AchievementTier } from '../../../core/achievements'

/** Each tier's metal as light, middle and shadow stops. */
const METALS: Record<AchievementTier, readonly [string, string, string]> = {
  bronze: ['#e0a676', '#b07648', '#6e4428'],
  silver: ['#e9eff3', '#aab6bf', '#5f6b74'],
  gold: ['#f6dc8c', '#d4a940', '#7f5f1a'],
  platinum: ['#f1f7fb', '#b9d3e2', '#4f6f82'],
}

/** Points around the centre, alternating between two radii, as one closed path. */
const star = (points: number, outer: number, inner: number) =>
  `${Array.from({ length: points * 2 }, (_, index) => {
    const radius = index % 2 ? inner : outer
    const angle = (index * Math.PI) / points - Math.PI / 2
    return `${index ? 'L' : 'M'}${(32 + radius * Math.cos(angle)).toFixed(2)} ${(32 + radius * Math.sin(angle)).toFixed(2)}`
  }).join('')}Z`

/** A medal's outline grows with its tier: a disc, a hexagon, a studded octagon, then a sunburst. */
const FRAMES: Record<AchievementTier, { outer: ReactNode; inner: ReactNode }> = {
  bronze: { outer: <circle cx="32" cy="32" r="28.5" />, inner: <circle cx="32" cy="32" r="23.5" /> },
  silver: {
    outer: <path d="M32 3 57.1 17.5v29L32 61 6.9 46.5v-29Z" />,
    inner: <path d="M32 9 51.9 20.5v23L32 55 12.1 43.5v-23Z" />,
  },
  gold: {
    outer: <path d="M22 3h20l19 19v20L42 61H22L3 42V22Z" />,
    inner: <path d="M24.4 8.5h15.2l15.9 15.9v15.2L39.6 55.5H24.4L8.5 39.6V24.4Z" />,
  },
  platinum: { outer: <path d={star(16, 30, 26)} />, inner: <circle cx="32" cy="32" r="21.5" /> },
}

const stroke = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round' } as const

/** Leaves on an arc either side of the centre, the wreath a win is crowned with. */
const wreath = [-1, 1].flatMap((side) =>
  [0, 1, 2, 3, 4].map((index) => {
    const angle = ((90 + side * (40 + index * 26)) * Math.PI) / 180
    const x = 32 + 12 * Math.cos(angle)
    const y = 31 + 12 * Math.sin(angle)
    const tilt = (angle * 180) / Math.PI + (side < 0 ? -60 : 60)
    return <ellipse key={`${side}-${index}`} cx={x} cy={y} rx="2" ry="4.2" transform={`rotate(${tilt} ${x} ${y})`} />
  }),
)

/** One emblem per series, drawn in the frame's inner field, about 20 to 44 on both axes. */
const EMBLEMS: Record<AchievementMetric, ReactNode> = {
  battles: <path d="m21 22 11 6.5L43 22M21 29.5 32 36l11-6.5M21 37l11 6.5L43 37" {...stroke} strokeLinecap="butt" strokeWidth="3" />,
  wins: (
    <>
      {wreath}
      <path d="M32 24.5 34 29h4.8l-3.9 2.9 1.5 4.6-4.4-2.8-4.4 2.8 1.5-4.6-3.9-2.9H30Z" />
    </>
  ),
  streak: (
    <g {...stroke} strokeWidth="2.4">
      {[
        [25.6, 38.4],
        [32, 32],
        [38.4, 25.6],
      ].map(([x, y]) => (
        <rect key={x} x={x! - 4} y={y! - 8} width="8" height="16" rx="4" transform={`rotate(45 ${x} ${y})`} />
      ))}
    </g>
  ),
  draws: (
    <>
      <path d="M32 20v24M24 44h16M20 25h24" {...stroke} strokeWidth="2.2" />
      <path d="m20 26-3.5 8h7Zm24 0-3.5 8h7Z" />
    </>
  ),
  'close-wins': (
    <>
      <circle cx="32" cy="34" r="10" {...stroke} strokeWidth="2.4" />
      <path d="M29 20h6M32 20v4M32 34l4.5-4.5" {...stroke} strokeWidth="2.4" />
    </>
  ),
  routs: (
    <>
      <path d="M32 19 43 23v8c0 7-4.6 11.4-11 14-6.4-2.6-11-7-11-14v-8Z" />
      <path d="m33 19.5-3.5 8 4 3.5-3.5 6 2 6.5" fill="none" stroke="var(--color-sunken)" strokeWidth="2" strokeLinejoin="round" />
    </>
  ),
  concessions: (
    <>
      <path d="M23 19v26" {...stroke} strokeWidth="2.4" />
      <path d="M24 20.5c4-2 7.5 2 11 0s5-1.5 7 0v11c-2-1.5-3.5-2-7 0s-7-2-11 0Z" />
    </>
  ),
  'team-wins': (
    <>
      <path d="M26.5 21 35 24v6c0 5.5-3.6 9-8.5 11-4.9-2-8.5-5.5-8.5-11v-6Z" />
      <path d="M37.5 23 46 26v6c0 5.5-3.6 9-8.5 11-4.9-2-8.5-5.5-8.5-11v-6Z" stroke="var(--color-sunken)" strokeWidth="1.6" />
    </>
  ),
  opponents: (
    <>
      <circle cx="32" cy="32" r="6.5" {...stroke} strokeWidth="2.2" />
      <circle cx="32" cy="32" r="1.9" />
      {[0, 1, 2, 3, 4].map((index) => {
        const angle = ((index * 72 - 90) * Math.PI) / 180
        return <circle key={index} cx={32 + 13 * Math.cos(angle)} cy={32 + 13 * Math.sin(angle)} r="2.4" />
      })}
    </>
  ),
  'factions-faced': (
    <>
      <path d="M18 32s5.5-8 14-8 14 8 14 8-5.5 8-14 8-14-8-14-8Z" {...stroke} strokeWidth="2.2" />
      <circle cx="32" cy="32" r="4.5" />
      <path d="M32 29.5v5" stroke="var(--color-sunken)" strokeWidth="1.6" />
    </>
  ),
  armies: (
    <>
      {[22, 32, 42].map((x, index) => (
        <g key={x}>
          <path d={`M${x} ${index === 1 ? 18 : 22}v24`} {...stroke} strokeWidth="1.8" />
          <path d={`M${x - 3.5} ${index === 1 ? 20 : 24}h7v9l-3.5-2.5-3.5 2.5Z`} />
        </g>
      ))}
    </>
  ),
  rivalry: (
    <>
      <path d="m21 21 20 20M43 21 23 41" {...stroke} strokeWidth="2.8" />
      <path d="M38 44l6-6M20 38l6 6" {...stroke} strokeWidth="2.4" />
    </>
  ),
  photos: (
    <>
      <rect x="21.5" y="21.5" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <path d="m24.5 39.5 5.5-7.5 4 5 2.5-3 3.5 5.5Z" />
      <circle cx="36.5" cy="27.5" r="2.2" />
    </>
  ),
  likes: (
    <>
      <path d="M32 44s-11.5-6.8-11.5-14.6A6.2 6.2 0 0 1 32 26a6.2 6.2 0 0 1 11.5 3.4C43.5 37.2 32 44 32 44Z" />
      <path d="M32 17v3.5M23.5 19.5l1.8 2.8M40.5 19.5l-1.8 2.8" {...stroke} strokeWidth="1.8" />
    </>
  ),
  recruits: (
    <>
      <circle cx="27" cy="27" r="4.6" />
      <path d="M18.5 43.5c0-6 3.8-9.5 8.5-9.5s8.5 3.5 8.5 9.5Z" />
      <path d="M41 21v10M36 26h10" {...stroke} strokeWidth="2.6" />
    </>
  ),
  tournaments: (
    <>
      <path d="M25 19v26M21 45h8" {...stroke} strokeWidth="2.4" />
      <path d="M26 20.5h15l-3.8 5.5 3.8 5.5H26Z" />
    </>
  ),
  organised: (
    <>
      {[22, 30, 38].map((y) => (
        <g key={y}>
          <rect x="20" y={y} width="10" height="4.5" />
          <rect x="34" y={y} width="10" height="4.5" />
          <path d={`M31 ${y + 2.25}h2`} stroke="currentColor" strokeWidth="1.2" />
        </g>
      ))}
    </>
  ),
  championships: (
    <>
      <path d="m21 40-2.5-15.5 7.5 6 6-10 6 10 7.5-6L43 40Z" />
      <path d="M21 44h22" stroke="currentColor" strokeWidth="2.6" />
      <circle cx="32" cy="33" r="2" fill="var(--color-sunken)" />
    </>
  ),
  rosters: (
    <>
      <path d="M23 19h15l4 4v22H23Z" />
      <path d="M27 27h11M27 32h11M27 37h7" stroke="var(--color-sunken)" strokeWidth="2" />
    </>
  ),
  published: (
    <>
      <path d="M21 21h14l4 4v19H21Z" />
      <path d="M25 29h9M25 34h9" stroke="var(--color-sunken)" strokeWidth="2" />
      <path d="M38 33c2.5 2.5 2.5 6.5 0 9M42 30c4.2 4.2 4.2 10.8 0 15" {...stroke} strokeWidth="2" />
    </>
  ),
  loans: (
    <>
      <path d="M19 26h16M30 21l5 5-5 5M45 38H29M34 33l-5 5 5 5" {...stroke} strokeWidth="2.6" />
    </>
  ),
  'listed-battles': (
    <>
      <path d="M20 21h12v23H20Z" />
      <path d="M23 27h6M23 31h6M23 35h4" stroke="var(--color-sunken)" strokeWidth="1.8" />
      <path d="m36 42 9-17M41 25h4v4M35 37l5 3" {...stroke} strokeWidth="2.4" />
    </>
  ),
  simulations: (
    <>
      <rect x="20" y="22" width="14" height="14" rx="2" transform="rotate(-12 27 29)" />
      <rect x="31" y="28" width="14" height="14" rx="2" transform="rotate(10 38 35)" />
      <circle cx="27" cy="29" r="1.6" fill="var(--color-sunken)" />
      <circle cx="35" cy="32" r="1.4" fill="var(--color-sunken)" />
      <circle cx="41" cy="38" r="1.4" fill="var(--color-sunken)" />
    </>
  ),
  practice: (
    <>
      <circle cx="32" cy="32" r="12" {...stroke} strokeWidth="2.4" />
      <circle cx="32" cy="32" r="6.5" {...stroke} strokeWidth="2.4" />
      <circle cx="32" cy="32" r="2" />
    </>
  ),
  'guest-battles': (
    <>
      <circle cx="25" cy="26" r="4.4" />
      <path d="M17 43c0-5.6 3.6-9 8-9s8 3.4 8 9Z" />
      <circle cx="39" cy="26" r="4.4" {...stroke} strokeWidth="1.8" strokeDasharray="2.4 2" />
      <path d="M31 43c0-5.6 3.6-9 8-9s8 3.4 8 9" {...stroke} strokeWidth="1.8" strokeDasharray="2.4 2" />
    </>
  ),
  imports: (
    <>
      <path d="M20 31v12h24V31" {...stroke} strokeWidth="2.4" />
      <path d="M32 18v17M26 29l6 6 6-6" {...stroke} strokeWidth="2.6" />
    </>
  ),
  reminders: (
    <>
      <path d="M32 19c-5.5 0-9 4-9 9.5v5.5l-3 4h24l-3-4v-5.5c0-5.5-3.5-9.5-9-9.5Z" />
      <path d="M29 41.5a3 3 0 0 0 6 0" {...stroke} strokeWidth="2.2" />
    </>
  ),
  loadouts: (
    <>
      <path d="m22 42 11.5-11.5" {...stroke} strokeWidth="3.4" />
      <path d="M35.5 19.5a7 7 0 0 0-6 9l3 3a7 7 0 0 0 9-6l-4 1.5-2.5-2.5Z" />
    </>
  ),
  favourites: <path d="m32 19 3.9 8 8.8 1.3-6.4 6.2 1.5 8.8L32 39.1l-7.8 4.2 1.5-8.8-6.4-6.2 8.8-1.3Z" />,
  app: (
    <>
      <rect x="24" y="18" width="16" height="28" rx="2.5" {...stroke} strokeWidth="2.4" />
      <path d="M29.5 41h5" {...stroke} strokeWidth="2" />
      <path d="M28 26.5h8v8h-8Z" />
    </>
  ),
  friends: (
    <>
      <circle cx="26" cy="26" r="4.4" />
      <circle cx="38" cy="26" r="4.4" />
      <path d="M17.5 43c0-5.6 3.8-9 8.5-9 2.4 0 4.6.9 6 2.6 1.4-1.7 3.6-2.6 6-2.6 4.7 0 8.5 3.4 8.5 9Z" />
    </>
  ),
  'likes-given': (
    <>
      <path d="M28 40s-9-5.3-9-11.4A4.9 4.9 0 0 1 28 26a4.9 4.9 0 0 1 9 2.6C37 34.7 28 40 28 40Z" />
      <path d="M38 37h8M42 33l4 4-4 4" {...stroke} strokeWidth="2.2" />
    </>
  ),
  'club-battles': (
    <>
      <path d="M21 19h22v11c0 7-4.9 11.6-11 14-6.1-2.4-11-7-11-14Z" />
      <path d="m26 25 12 12M38 25 26 37" stroke="var(--color-sunken)" strokeWidth="2.4" strokeLinecap="round" />
    </>
  ),
  leagues: (
    <>
      <rect x="20" y="22" width="24" height="21" {...stroke} strokeWidth="2.4" />
      <path d="M20 28h24M26 19v6M38 19v6" {...stroke} strokeWidth="2.4" />
      <path d="M24 32h4v3h-4ZM30 32h4v3h-4ZM36 32h4v3h-4ZM24 37h4v3h-4ZM30 37h4v3h-4Z" />
    </>
  ),
  'leagues-run': (
    <>
      <rect x="20" y="22" width="24" height="21" {...stroke} strokeWidth="2.4" />
      <path d="M20 28h24M26 19v6M38 19v6" {...stroke} strokeWidth="2.4" />
      <path d="m26 35.5 4 4 8-8" {...stroke} strokeWidth="2.8" />
    </>
  ),
  seals: (
    <>
      <path d={star(10, 12, 10.2)} />
      <circle cx="32" cy="32" r="6" fill="none" stroke="var(--color-sunken)" strokeWidth="1.6" />
      <path d="m29.5 32 2 2 3.5-4" fill="none" stroke="var(--color-sunken)" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
  collected: (
    <>
      <path d="M19 27 32 21l13 6-13 6Z" />
      <path d="M19 30v10l13 6V36ZM45 30v10l-13 6V36Z" />
    </>
  ),
  painted: (
    <>
      <path d="m41 19-11 13.5 2.5 2.5L46 24Z" />
      <path d="M29 34c-4 0-6 2.5-6 5.5 0 2-1.5 3.5-4 4 6 1.5 12.5-.5 12.5-6.5Z" />
    </>
  ),
  wishes: <path d="m32 19 3.9 8 8.8 1.3-6.4 6.2 1.5 8.8L32 39.1l-7.8 4.2 1.5-8.8-6.4-6.2 8.8-1.3Z" {...stroke} strokeWidth="2.2" />,
  founded: (
    <>
      <path d="M21 45V28h3v-4.5h3.5V28h2.5v-4.5h4V28h2.5v-4.5H40V28h3v17Z" />
      <path d="M29 45v-6a3 3 0 0 1 6 0v6Z" fill="var(--color-sunken)" />
      <path d="M32 23.5V17l5 2-5 2" {...stroke} strokeWidth="1.6" />
    </>
  ),
}

/**
 * One achievement's medal: its series' emblem struck in its tier's metal, with the count it needs on a
 * ribbon when that is more than one. Not yet earned, it is the same medal in grey, so a player can see
 * what there is to win.
 */
export function AchievementBadge({
  metric,
  count,
  tier,
  earned,
  className = '',
}: {
  metric: AchievementMetric
  count: number
  tier: AchievementTier
  earned: boolean
  className?: string
}) {
  const key = useId()
  const [light, middle, shadow] = METALS[tier]
  const frame = FRAMES[tier]
  return (
    <svg viewBox="0 0 64 64" className={`${earned ? '' : 'opacity-45 grayscale'} ${className}`} aria-hidden>
      <defs>
        <linearGradient id={`${key}-rim`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={light} />
          <stop offset="0.5" stopColor={shadow} />
          <stop offset="1" stopColor={middle} />
        </linearGradient>
        <linearGradient id={`${key}-face`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={light} />
          <stop offset="1" stopColor={middle} />
        </linearGradient>
        <radialGradient id={`${key}-field`} cx="0.5" cy="0.38" r="0.7">
          <stop offset="0" stopColor="var(--color-raised)" />
          <stop offset="1" stopColor="var(--color-sunken)" />
        </radialGradient>
      </defs>
      <g fill={`url(#${key}-field)`} stroke={`url(#${key}-rim)`} strokeWidth="3">
        {frame.outer}
      </g>
      <g fill="none" stroke={middle} strokeOpacity="0.55" strokeWidth="0.9">
        {frame.inner}
      </g>
      {tier === 'gold'
        ? [
            [32, 3],
            [61, 32],
            [32, 61],
            [3, 32],
          ].map(([x, y]) => <path key={`${x}-${y}`} d={`M${x} ${y! - 2.6}l2.6 2.6-2.6 2.6-2.6-2.6Z`} fill={light} />)
        : null}
      <g fill={`url(#${key}-face)`} color={light}>
        {EMBLEMS[metric]}
      </g>
      {count > 1 ? (
        <g>
          <rect x="19" y="50" width="26" height="10" fill="var(--color-sunken)" stroke={`url(#${key}-rim)`} strokeWidth="1.2" />
          <text x="32" y="57.6" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="7.5" fontWeight="700" fill={light}>
            {count}
          </text>
        </g>
      ) : null}
    </svg>
  )
}
