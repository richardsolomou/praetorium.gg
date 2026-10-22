import { ChevronLeft, ChevronRight } from 'lucide-react'
import { type KeyboardEvent, type ReactNode, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/Dialog'

/** Which photo of a list is open, and the steps to its neighbours; one that leaves the list, as a reported photo does, stays open without them. */
export function usePhotoSteps<Photo extends { photoId: string }>(photos: readonly Photo[]) {
  const [opened, setOpened] = useState<Photo | null>(null)
  const index = opened ? photos.findIndex((photo) => photo.photoId === opened.photoId) : -1
  const step = (offset: number) => {
    const photo = index < 0 ? undefined : photos[index + offset]
    return photo ? () => setOpened(photo) : undefined
  }
  return {
    current: photos[index] ?? opened,
    open: (photoId: string) => setOpened(photos.find((photo) => photo.photoId === photoId) ?? null),
    close: () => setOpened(null),
    previous: step(-1),
    next: step(1),
  }
}

type LightboxProps = {
  open: boolean
  onClose: () => void
  title: ReactNode
  description: ReactNode
  src: string | null
  alt: string
  onPrevious?: () => void
  onNext?: () => void
  footer?: ReactNode
  children?: ReactNode
}

/** A photo at full size, stepping to its neighbours with the side buttons or the arrow keys. */
export function PhotoLightbox(props: LightboxProps) {
  // Callers clear the photo as they close, so the closing dialog keeps showing the last one until it has faded out.
  const [shown, setShown] = useState(props)
  if (props.open && props.src !== shown.src) setShown(props)
  const { open, onClose } = props
  const { title, description, src, alt, onPrevious, onNext, footer, children } = open ? props : shown
  const stepping = Boolean(onPrevious || onNext)
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Keys typed into a field, or into a confirmation portalled out of this dialog, are not steps.
    if (!(event.target instanceof Element) || !event.currentTarget.contains(event.target) || event.target.closest('input, textarea')) return
    const step = event.key === 'ArrowLeft' ? onPrevious : event.key === 'ArrowRight' ? onNext : undefined
    if (!step) return
    event.preventDefault()
    step()
  }
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent size="md" onKeyDown={onKeyDown}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogBody className="content-center bg-sunken">
          {src ? (
            <div className="relative">
              <img src={src} alt={alt} className="mx-auto max-h-[calc(100dvh-13rem)] max-w-full object-contain" />
              {stepping ? (
                <>
                  <StepButton side="left" label="Previous photo" onClick={onPrevious}>
                    <ChevronLeft />
                  </StepButton>
                  <StepButton side="right" label="Next photo" onClick={onNext}>
                    <ChevronRight />
                  </StepButton>
                </>
              ) : null}
            </div>
          ) : null}
          {children}
        </DialogBody>
        {footer ? <DialogFooter className="flex-row items-center">{footer}</DialogFooter> : null}
      </DialogContent>
    </Dialog>
  )
}

function StepButton({
  side,
  label,
  onClick,
  children,
}: {
  side: 'left' | 'right'
  label: string
  onClick?: () => void
  children: ReactNode
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label={label}
      disabled={!onClick}
      onClick={onClick}
      className={`absolute inset-y-0 my-auto bg-panel/85 disabled:opacity-0 ${side === 'left' ? 'left-1' : 'right-1'}`}
    >
      {children}
    </Button>
  )
}
