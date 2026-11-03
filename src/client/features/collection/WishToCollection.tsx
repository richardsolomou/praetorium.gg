import { useState } from 'react'
import { ArrowRight, PackagePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MAX_COLLECTION_MODELS } from '../../../core/collection'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { ControlTooltip } from '../../components/ControlTooltip'
import { ModelCounter } from '../../components/ModelCounter'
import { countLabel } from '../../text'
import { useCollectionCountMutation, useCollectionMutation, useCollectionWantedMutation } from '../../useCollection'

function Change({ label, from, to }: { label: string; from: number; to: number }) {
  return (
    <span className="flex items-center justify-between gap-3 text-sm">
      <span className="text-dim">{label}</span>
      <span className="readout flex items-center gap-1.5">
        <span className="text-faint">{from}</span>
        <ArrowRight aria-hidden className="size-3.5 text-faint" />
        <span className="text-bone">{to}</span>
      </span>
    </span>
  )
}

/** Moves models the player now has from the wishlist onto the shelf: one wanted model moves at once, more ask how many. */
export function WishToCollection({
  entryId,
  name,
  wanted,
  onShelf,
}: {
  entryId: string
  name: string
  wanted: number
  onShelf: number | null
}) {
  const addToShelf = useCollectionMutation()
  const count = useCollectionCountMutation()
  const want = useCollectionWantedMutation()
  const [choosing, setChoosing] = useState(false)
  const [moving, setMoving] = useState(wanted)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const shelved = (models: number) => Math.min((onShelf ?? 0) + models, MAX_COLLECTION_MODELS)
  const move = async (models: number) => {
    if (onShelf === null) return
    setPending(true)
    setError(null)
    try {
      if (!onShelf) await addToShelf.mutateAsync({ entryId, owned: true })
      if (shelved(models) > 1) await count.mutateAsync({ entryId, models: shelved(models) })
      await want.mutateAsync({ entryId, wanted: wanted - models })
      setChoosing(false)
    } catch (failure) {
      setError(failure instanceof Error ? failure : new Error('Your collection could not be updated.'))
    } finally {
      setPending(false)
    }
  }
  return (
    <>
      <ControlTooltip label="Move to collection">
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-faint hover:text-primary"
          aria-label={`Move ${name} to your collection`}
          disabled={onShelf === null || pending}
          onClick={() => {
            if (wanted === 1) return void move(1)
            setMoving(wanted)
            setError(null)
            setChoosing(true)
          }}
        >
          <PackagePlus />
        </Button>
      </ControlTooltip>
      <ConfirmDialog
        open={choosing}
        title={`Move ${name} to your collection`}
        description={`How many of the ${countLabel(wanted, 'model')} you want do you have now?`}
        cancel="Cancel"
        confirm={`Move ${countLabel(moving, 'model')}`}
        pendingLabel="Moving…"
        pending={pending}
        error={error}
        onClose={() => setChoosing(false)}
        onConfirm={() => void move(moving)}
      >
        <div className="@container space-y-4">
          <div className="flex justify-center">
            <ModelCounter
              count={moving}
              label={`moved ${name}`}
              inputLabel={`${name} models to move`}
              max={wanted}
              caption="Models"
              maxAction
              onChange={setMoving}
            />
          </div>
          <div className="space-y-1.5 border-t border-dashed border-edge pt-3">
            <Change label="Wishlist" from={wanted} to={wanted - moving} />
            <Change label="On your shelf" from={onShelf ?? 0} to={shelved(moving)} />
          </div>
        </div>
      </ConfirmDialog>
    </>
  )
}
