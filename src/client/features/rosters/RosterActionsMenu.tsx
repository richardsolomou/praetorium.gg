import {
  Archive,
  ArchiveRestore,
  Calculator,
  ClipboardCheck,
  Copy,
  Download,
  EllipsisVertical,
  GitBranchPlus,
  Group,
  HandHelping,
  Lock,
  LockOpen,
  Pencil,
  Share2,
  Trash2,
  Unlink,
} from 'lucide-react'
import { posthog } from 'posthog-js'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { RosterVisibility } from '../../../core/savedRoster'
import { DropdownMenuCheckboxItem, DropdownMenuItem, MenuSection } from '../../components/Menu'
import type { AccountReason } from './AccountPrompt'
import type { ShelfArrangement } from './builder/shelves'
import { peekGuestDraft } from './guestDraft'
import { keepRosterArrangement } from './rosterArrangement'
import type { RosterActions } from './useRosterActions'
import { VisibilityTag } from './VisibilityTag'

/**
 * The roster header's actions: starting a battle, the variant menu, the actions menu,
 * and, for a list the reader may edit, the switch between building and viewing it.
 */
export function RosterActionsMenu({
  editable,
  locked,
  guest,
  signedIn,
  savedId,
  saving,
  building,
  hasUnits,
  frozen,
  pricing,
  gradesAvailable,
  hasAttachedUnits,
  arrangement,
  setArrangement,
  ownsSaved,
  archived,
  visibility,
  variantCount,
  actions: { take, duplicateRoster, splitVariant, createVariant, lockRoster, archiveRoster },
  startBattle,
  variantMenu,
  onAsk,
  onSetup,
  onShare,
  onLend,
  onGrade,
  onDelete,
  onTestTargets,
  onReadOnlyMode,
}: {
  editable: boolean
  locked: boolean
  guest: boolean
  signedIn: boolean
  savedId: string
  saving: boolean
  building: boolean
  hasUnits: boolean
  frozen: boolean
  /** The price is still being worked out, so nothing that reads it can start yet. */
  pricing: boolean
  gradesAvailable: boolean
  hasAttachedUnits: boolean
  arrangement: ShelfArrangement
  setArrangement: (next: ShelfArrangement) => void
  ownsSaved: boolean
  archived?: boolean
  visibility: RosterVisibility
  variantCount: number
  actions: RosterActions
  startBattle: ReactNode
  variantMenu: ReactNode
  onAsk: (reason: AccountReason) => void
  onSetup: () => void
  onShare: () => void
  onLend: () => void
  onGrade: () => void
  onDelete: () => void
  onTestTargets: () => void
  onReadOnlyMode: (next: boolean) => void
}) {
  const splitItem =
    savedId && variantCount > 1 ? (
      <DropdownMenuItem disabled={splitVariant.isPending} onClick={() => splitVariant.mutate(savedId)}>
        <Unlink /> Make its own roster
      </DropdownMenuItem>
    ) : null
  const shareItem = (
    <DropdownMenuItem onClick={onShare}>
      <Share2 /> Share…
      {ownsSaved || guest ? <VisibilityTag visibility={visibility} /> : null}
    </DropdownMenuItem>
  )
  const exportItem = (
    <DropdownMenuItem disabled={take.isPending || !hasUnits} onClick={() => take.mutate()}>
      <Download /> Export text
    </DropdownMenuItem>
  )

  const displaySection = hasAttachedUnits ? (
    <MenuSection label="Display">
      <DropdownMenuCheckboxItem
        checked={arrangement === 'attached'}
        closeOnClick
        onCheckedChange={(checked) => {
          const next = checked ? 'attached' : 'role'
          setArrangement(next)
          keepRosterArrangement(next)
          posthog.capture('roster_arrangement_changed', { arrangement: next })
        }}
      >
        <Group /> Group attached units
      </DropdownMenuCheckboxItem>
    </MenuSection>
  ) : null

  const manageSection = ownsSaved ? (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuItem disabled={archiveRoster.isPending} onClick={() => archiveRoster.mutate(!archived)}>
        {archived ? (
          <>
            <ArchiveRestore /> Unarchive
          </>
        ) : (
          <>
            <Archive /> Archive
          </>
        )}
      </DropdownMenuItem>
      <DropdownMenuItem variant="destructive" onClick={onDelete}>
        <Trash2 /> Delete
      </DropdownMenuItem>
    </>
  ) : null

  const testTargets = !frozen ? (
    <DropdownMenuItem disabled={!hasUnits || pricing} onClick={onTestTargets}>
      <Calculator /> Test targets
    </DropdownMenuItem>
  ) : null
  const gradeItem = gradesAvailable ? (
    <DropdownMenuItem disabled={!hasUnits} onClick={onGrade}>
      <ClipboardCheck /> Grade this roster
    </DropdownMenuItem>
  ) : null

  // Starting a battle is the button beside this menu, so the menu offers only the other ways to play.
  const playSection =
    testTargets || gradeItem ? (
      <MenuSection label="Play">
        {testTargets}
        {gradeItem}
      </MenuSection>
    ) : null

  return editable ? (
    <>
      {savedId || guest ? startBattle : null}
      {variantMenu}
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Roster actions" />}>
          <EllipsisVertical />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-max">
          {playSection}
          <MenuSection label="Edit">
            <DropdownMenuItem onClick={onSetup}>
              <Pencil /> Edit roster setup
            </DropdownMenuItem>
            {savedId && !guest ? (
              <DropdownMenuItem disabled={saving || lockRoster.isPending} onClick={() => lockRoster.mutate(true)}>
                <Lock /> Lock roster
              </DropdownMenuItem>
            ) : guest ? (
              <DropdownMenuItem onClick={() => onAsk('lock')}>
                <Lock /> Lock roster
              </DropdownMenuItem>
            ) : null}
          </MenuSection>
          <MenuSection label="Share">
            {shareItem}
            {exportItem}
            {savedId && !guest ? (
              <DropdownMenuItem onClick={onLend}>
                <HandHelping /> Lend to a friend
              </DropdownMenuItem>
            ) : guest ? (
              <DropdownMenuItem onClick={() => onAsk('lend')}>
                <HandHelping /> Lend to a friend
              </DropdownMenuItem>
            ) : null}
          </MenuSection>
          {savedId || guest ? (
            <>
              <MenuSection label="Copy">
                {savedId && !guest ? (
                  <>
                    <DropdownMenuItem disabled={saving || createVariant.isPending} onClick={() => createVariant.mutate(savedId)}>
                      <GitBranchPlus /> Create variant
                    </DropdownMenuItem>
                    {splitItem}
                    <DropdownMenuItem disabled={saving || duplicateRoster.isPending} onClick={() => duplicateRoster.mutate()}>
                      <Copy /> Duplicate
                    </DropdownMenuItem>
                  </>
                ) : (
                  // Offered as an account offers them, so a visitor finds out what signing up adds.
                  <>
                    <DropdownMenuItem onClick={() => onAsk('variant')}>
                      <GitBranchPlus /> Create variant
                    </DropdownMenuItem>
                    {splitItem}
                    <DropdownMenuItem onClick={() => onAsk('another-roster')}>
                      <Copy /> Duplicate
                    </DropdownMenuItem>
                  </>
                )}
              </MenuSection>
            </>
          ) : null}
          {displaySection}
          {manageSection}
        </DropdownMenuContent>
      </DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <div>
              <ToggleGroup
                value={[building ? 'build' : 'view']}
                onValueChange={(value) => {
                  if (value[0] === 'view' || value[0] === 'build') onReadOnlyMode(value[0] === 'view')
                }}
                variant="outline"
                size="sm"
                spacing={0}
                aria-label="Roster mode"
              >
                <ToggleGroupItem
                  value="build"
                  className="border-primary/60 text-primary first:rounded-l-md last:rounded-r-md aria-pressed:bg-primary aria-pressed:text-primary-foreground"
                >
                  Build
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="view"
                  className="border-primary/60 text-primary first:rounded-l-md last:rounded-r-md aria-pressed:bg-primary aria-pressed:text-primary-foreground"
                >
                  View
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          }
        />
        <TooltipContent side="bottom">View hides editing controls and simplifies cards and loadouts.</TooltipContent>
      </Tooltip>
    </>
  ) : (
    <>
      {locked ? startBattle : null}
      {locked ? variantMenu : null}
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Roster actions" />}>
          <EllipsisVertical />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-max">
          {playSection}
          {locked ? (
            <MenuSection label="Edit">
              <DropdownMenuItem disabled={lockRoster.isPending} onClick={() => lockRoster.mutate(false)}>
                <LockOpen /> Unlock roster
              </DropdownMenuItem>
            </MenuSection>
          ) : null}
          <MenuSection label="Share">
            {shareItem}
            {exportItem}
            {locked ? (
              <DropdownMenuItem onClick={onLend}>
                <HandHelping /> Lend to a friend
              </DropdownMenuItem>
            ) : null}
          </MenuSection>
          <MenuSection label="Copy">
            {locked ? (
              <>
                <DropdownMenuItem disabled={createVariant.isPending} onClick={() => createVariant.mutate(savedId)}>
                  <GitBranchPlus /> Create variant
                </DropdownMenuItem>
                {splitItem}
                <DropdownMenuItem disabled={duplicateRoster.isPending} onClick={() => duplicateRoster.mutate()}>
                  <Copy /> Duplicate
                </DropdownMenuItem>
              </>
            ) : signedIn ? (
              <DropdownMenuItem disabled={duplicateRoster.isPending || !hasUnits} onClick={() => duplicateRoster.mutate()}>
                <Copy /> Duplicate to my rosters
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                disabled={duplicateRoster.isPending || !hasUnits}
                onClick={() => (peekGuestDraft() ? onAsk('another-roster') : duplicateRoster.mutate())}
              >
                <Copy /> Duplicate to this device
              </DropdownMenuItem>
            )}
          </MenuSection>
          {displaySection}
          {manageSection}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
