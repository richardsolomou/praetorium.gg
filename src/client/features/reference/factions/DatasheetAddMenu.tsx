import { useQuery } from '@tanstack/react-query'
import { Link, useRouterState } from '@tanstack/react-router'
import { Boxes, ChevronDown, ChevronRight, Heart, Plus, ScrollText, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useFavouriteDatasheets } from '../../../favouriteDatasheets'
import { collectionQuery, meQuery } from '../../../queries'
import { useCollectionMutation } from '../../../useCollection'
import { CollectionCount } from '../../collection/CollectionCount'
import { RemoveFromCollection } from '../../collection/RemoveFromCollection'
import { AddToRoster } from '../../rosters/ReferenceRosterActions'
import type { RosterSetupFaction } from '../../rosters/RosterSetupDialog'

const ROW = 'flex min-h-10 w-full items-center gap-2.5 rounded-md px-2 text-left text-sm transition-colors hover:bg-accent'

/**
 * One Add to action for a datasheet: a roster, favourites, or the player's collection.
 *
 * A popover rather than a menu, because the collection row holds the model count.
 */
export function DatasheetAddMenu({ faction, entryId, name }: { faction: RosterSetupFaction; entryId: string; name: string }) {
  const [open, setOpen] = useState(false)
  const [removing, setRemoving] = useState(false)
  const path = useRouterState({ select: (state) => state.location.href })
  const { data: me } = useQuery(meQuery())
  const signedIn = Boolean(me)
  const { favourites, toggleFavourite } = useFavouriteDatasheets(signedIn)
  const { data: collection } = useQuery({ ...collectionQuery(), enabled: signedIn })
  const { mutate: setOwned } = useCollectionMutation()
  const favourite = favourites.has(entryId)
  const owned = (collection ?? []).includes(entryId)
  return (
    <>
      <AddToRoster
        faction={faction}
        entryId={entryId}
        name={name}
        renderTrigger={(openRoster) => (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger render={<Button variant="outline" size="sm" />}>
              <Plus /> Add to <ChevronDown />
            </PopoverTrigger>
            <PopoverContent align="end" aria-label={`Add ${name} to`} className="w-72 gap-0 p-1">
              <button
                type="button"
                className={ROW}
                onClick={() => {
                  setOpen(false)
                  openRoster()
                }}
              >
                <ScrollText className="size-4 text-dim" /> <span className="flex-1">Roster…</span>
                <ChevronRight className="size-4 text-faint" />
              </button>
              {signedIn ? (
                <button
                  type="button"
                  aria-label="Favourites"
                  aria-pressed={favourite}
                  className={ROW}
                  onClick={() => toggleFavourite(entryId)}
                >
                  <Heart className={`size-4 ${favourite ? 'fill-rust text-rust' : 'text-dim'}`} />
                  <span className="flex-1">Favourites</span>
                  {favourite ? <span className="text-xs text-dim">Added</span> : null}
                </button>
              ) : (
                <Link
                  to="/sign-in"
                  search={{ next: path }}
                  rel="nofollow"
                  aria-label={`Sign in to add ${name} to favourite datasheets`}
                  className={ROW}
                >
                  <Heart className="size-4 text-dim" /> <span className="flex-1">Favourites</span>
                  <span className="text-xs text-faint">Sign in</span>
                </Link>
              )}
              {!signedIn ? (
                <Link
                  to="/sign-in"
                  search={{ next: path }}
                  rel="nofollow"
                  aria-label={`Sign in to add ${name} to your collection`}
                  className={ROW}
                >
                  <Boxes className="size-4 text-dim" /> <span className="flex-1">Collection</span>
                  <span className="text-xs text-faint">Sign in</span>
                </Link>
              ) : owned ? (
                <div className={`${ROW} hover:bg-transparent`}>
                  <Boxes className="size-4 text-dim" />
                  <Link to="/collection" className="flex-1 underline-offset-4 hover:text-info hover:underline">
                    Collection
                  </Link>
                  <CollectionCount entryId={entryId} name={name} />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-faint hover:text-destructive"
                    aria-label={`Remove ${name} from your collection`}
                    onClick={() => {
                      setOpen(false)
                      setRemoving(true)
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ) : (
                <button type="button" aria-label="Add to collection" className={ROW} onClick={() => setOwned({ entryId, owned: true })}>
                  <Boxes className="size-4 text-dim" /> <span className="flex-1">Collection</span>
                  <Plus className="size-4 text-faint" />
                </button>
              )}
            </PopoverContent>
          </Popover>
        )}
      />
      <RemoveFromCollection datasheet={removing ? { id: entryId, name } : null} onClose={() => setRemoving(false)} />
    </>
  )
}
