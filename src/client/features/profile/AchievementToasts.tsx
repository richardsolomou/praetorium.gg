import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { ACHIEVEMENTS } from '../../../core/achievements'
import { markAchievementsSeen } from '../../functions'
import { newAchievementsQuery } from '../../queries'
import { AchievementBadge } from './AchievementBadge'

/**
 * Toasts each medal the signed-in player earns, with a way to their achievements tab. The server remembers which they
 * have been told of, so a medal is announced once across every device.
 */
export function AchievementToasts({ userId }: { userId: string }) {
  const { data } = useQuery(newAchievementsQuery())
  const navigate = useNavigate()
  useEffect(() => {
    if (!data?.length) return
    const fresh = new Set(data.map((achievement) => achievement.id))
    for (const achievement of ACHIEVEMENTS.filter((one) => fresh.has(one.id)))
      toast(`Achievement earned: ${achievement.name}`, {
        id: `achievement-${achievement.id}`,
        description: achievement.goal,
        icon: <AchievementBadge metric={achievement.metric} count={achievement.count} tier={achievement.tier} earned className="size-8" />,
        // Sonner sizes its icon slot for a 16px glyph; the medal needs room to read.
        classNames: { icon: 'size-8! mr-1!' },
        action: {
          label: 'View',
          onClick: () => void navigate({ to: '/users/$userId', params: { userId }, search: { tab: 'achievements' } }),
        },
      })
    void markAchievementsSeen({ data: { achievementIds: [...fresh] } })
  }, [data, userId, navigate])
  return null
}
