import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthAction } from 'ras-stack/auth/react'
import { useState } from 'react'
import { posthog } from 'posthog-js'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PROFILE_NAME_MAX_LENGTH } from '../../../core/profileName'
import { authClient } from '../../authClient'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/Dialog'
import { Problem } from '../../components/Problem'
import { meQuery } from '../../queries'
import { errorMessage } from '../../queryClient'
import { refreshProfileQueries } from './refreshProfileQueries'

/** Apple can sign a player up without sharing a name, and every other player sees that name, so ask before going on. */
export function DisplayNamePrompt() {
  const { data: me } = useQuery(meQuery())
  if (!me || me.name.trim() || me.impersonatedBy) return null
  return <DisplayNameDialog />
}

function DisplayNameDialog() {
  const [name, setName] = useState('')
  const queryClient = useQueryClient()
  const { busy, error, run, clearError } = useAuthAction({ failureMessage: errorMessage })
  return (
    <Dialog open disablePointerDismissal>
      <DialogContent className="ph-no-capture" showCloseButton={false} fit>
        <form
          className="contents"
          onSubmit={async (event) => {
            event.preventDefault()
            const result = await run(() => authClient.updateUser({ name: name.trim() }))
            if (result.error) return
            posthog.capture('profile_updated', { name_changed: true, image_changed: false, prompted: true })
            await refreshProfileQueries(queryClient)
          }}
        >
          <DialogHeader>
            <DialogTitle>Choose a display name</DialogTitle>
            <DialogDescription>Other players see it in battles, rosters and friend lists.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-2">
              <Label htmlFor="prompt-display-name">Display name</Label>
              <Input
                id="prompt-display-name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value)
                  clearError()
                }}
                maxLength={PROFILE_NAME_MAX_LENGTH}
                autoComplete="nickname"
                required
              />
            </div>
            {error ? <Problem>{error}</Problem> : null}
          </DialogBody>
          <DialogFooter>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? 'Saving…' : 'Save name'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
