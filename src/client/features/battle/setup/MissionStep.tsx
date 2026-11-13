import { Button } from '@/components/ui/button'
import type { Side } from '../../../sides'
import type { SendCommand } from '../useCommand'
import type { MissionDetails } from '../MissionCards'
import type { Twist } from '../MissionTwist'
import { SetupSidePanel } from './chrome'
import { SideDispositionChoice } from './SideDispositionChoice'
import { TwistChoice } from './TwistChoice'
import type { Configure } from './sections'

/** Each side's primary for its matchup, the disposition it plays, and the pack's twist. */
export function MissionStep({
  sides,
  send,
  configure,
  busy,
  twists,
  twistId,
  nameDisposition,
  primaryCardFor,
  onRead,
}: {
  sides: Side[]
  send: SendCommand
  configure: Configure
  busy: boolean
  twists: readonly Twist[]
  twistId: string | null
  nameDisposition: (id: string | null | undefined) => { id: string; name: string } | null
  primaryCardFor: (missionId: string) => MissionDetails['card'] | undefined
  onRead: (details: MissionDetails) => void
}) {
  return (
    <>
      <div className="grid items-start gap-6 md:grid-cols-2">
        {sides.map((side) => {
          const card = side.mission ? primaryCardFor(side.mission.id) : undefined
          return (
            <SetupSidePanel key={side.index} side={side} className="space-y-3">
              {side.mission ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="min-w-0 text-xl break-words">{side.mission.name}</h3>
                  {card ? (
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={`Read ${side.mission.name}`}
                      onClick={() => onRead({ name: side.mission!.name, card, type: 'Primary mission' })}
                    >
                      Read card
                    </Button>
                  ) : null}
                </div>
              ) : (
                <p className="py-2 text-sm text-dim">No mission for this matchup.</p>
              )}
              <SideDispositionChoice side={side} nameDisposition={nameDisposition} send={send} />
            </SetupSidePanel>
          )
        })}
      </div>
      {twists.length ? (
        <TwistChoice twists={twists} chosenId={twistId} disabled={busy} onChoose={(chosen) => configure({ twistId: chosen })} />
      ) : null}
    </>
  )
}
