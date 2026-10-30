import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ImagePlus, Trash2, UserRound } from 'lucide-react'
import { classifyAuthCallbackFailure } from 'ras-stack/auth/client'
import { useAuthAction } from 'ras-stack/auth/react'
import { useEffect, useRef, useState } from 'react'
import { posthog } from 'posthog-js'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PROFILE_NAME_MAX_LENGTH } from '../../../core/profileName'
import { authClient } from '../../authClient'
import { AccountSecurity } from './AccountSecurity'
import { captureAuthFailure } from './authFailureReason'
import { PlayerDefaultsSettings } from './PlayerDefaultsSettings'
import { PageContent, PageHeader } from '../../components/Page'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { SignInRequired } from '../../components/SignInRequired'
import { accountMethodsQuery, meQuery, type QueryData } from '../../queries'
import { errorMessage } from '../../queryClient'
import { prepareProfileImage } from './profileImage'
import { refreshProfileQueries } from './refreshProfileQueries'
import { Problem } from '../../components/Problem'
import { SectionHeading } from '../../components/SectionHeading'

const accountLinkErrorMessage = (error?: string) => {
  if (!error) return undefined
  switch (classifyAuthCallbackFailure(error)) {
    case 'invalid_token':
    case 'token_expired':
      return 'This email verification link is invalid or has expired.'
    case 'email_mismatch':
      return 'This provider uses a different email address. Use matching email addresses before linking.'
    case 'account_already_linked':
      return 'This provider is already linked to another Praetorium account.'
    default:
      return 'Could not link this sign-in method. Try again.'
  }
}

export function ProfilePage({ error, verified }: { error?: string; verified?: boolean }) {
  const { data: me } = useQuery(meQuery())
  const { data: methods } = useQuery({ ...accountMethodsQuery(), enabled: Boolean(me) })
  const callbackError = accountLinkErrorMessage(error)
  // A link that failed at the provider comes back here with only its code, so the provider is not known.
  useEffect(() => {
    if (error) captureAuthFailure(error, { action: 'link', method: 'social' })
  }, [error])
  if (!me && callbackError) {
    return <SignInRequired title="Could not complete account verification" explanation={`${callbackError} Sign in to try again.`} />
  }
  if (!me && verified) {
    return <SignInRequired title="Check your email verification" explanation="Sign in to confirm your email status." />
  }
  if (!me) return <SignInRequired title="Your profile" explanation="Sign in to edit your profile." />
  return <ProfileForm key={me.id} me={me} callbackError={callbackError} verified={verified && methods?.emailVerified} />
}

function ProfileForm({
  me,
  callbackError,
  verified,
}: {
  me: NonNullable<QueryData<typeof meQuery>>
  callbackError?: string
  verified?: boolean
}) {
  const [nameDraft, setName] = useState<string>()
  const [imageDraft, setImage] = useState<string | null>()
  const name = nameDraft ?? me.name
  const image = imageDraft === undefined ? me.image : imageDraft
  const [imageError, setImageError] = useState<string | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [saved, setSaved] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()
  const submit = useAuthAction({ failureMessage: errorMessage })

  const changed = name.trim() !== me.name || image !== me.image
  const save = async () => {
    setSaved(false)
    const submitted = { name: name.trim(), image }
    const result = await submit.run(() => authClient.updateUser(submitted))
    if (result.error) return
    await refreshProfileQueries(queryClient)
    setName((current) => (current?.trim() === submitted.name ? undefined : current))
    setImage((current) => (current === submitted.image ? undefined : current))
    posthog.capture('profile_updated', { name_changed: name.trim() !== me.name, image_changed: image !== me.image })
    setSaved(true)
  }

  const chooseImage = async (file: File | undefined) => {
    if (!file) return
    setPreparing(true)
    setSaved(false)
    setImageError(null)
    try {
      setImage(await prepareProfileImage(file))
    } catch (error) {
      posthog.captureException(error, { operation: 'profile_image_prepare' })
      setImageError(errorMessage(error, 'The profile picture could not be prepared.'))
    } finally {
      setPreparing(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  return (
    <main className="ph-no-capture w-full">
      <PageHeader
        eyebrow="Your account"
        title="Account settings"
        description="Your name and picture, sign-in and roster defaults."
        media={
          <span className="grid size-12 shrink-0 place-items-center border border-edge-strong bg-sunken text-parchment">
            <UserRound className="size-5" aria-hidden />
          </span>
        }
      />
      <PageContent className="space-y-6">
        {callbackError ? <Problem className="border border-destructive/40 bg-destructive/10 p-3">{callbackError}</Problem> : null}
        {verified && !callbackError ? (
          <output className="block border border-achieved/40 bg-achieved/10 p-3 text-sm text-achieved">Email address verified.</output>
        ) : null}

        <form
          className="grid gap-8 border border-edge bg-panel p-5 md:grid-cols-2 md:p-7"
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <section>
            <SectionHeading title="Profile picture" />
            <div className="mt-4 flex items-center gap-4">
              <PlayerAvatar name={name || me.name} image={image} className="size-24 text-3xl" />
              <div className="flex flex-wrap gap-2">
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  aria-label="Choose profile picture"
                  onChange={(event) => void chooseImage(event.target.files?.[0])}
                />
                <Button type="button" variant="outline" onClick={() => fileInput.current?.click()} disabled={preparing}>
                  <ImagePlus /> {preparing ? 'Preparing…' : image ? 'Replace picture' : 'Add picture'}
                </Button>
                {image ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-dim hover:text-destructive"
                    onClick={() => {
                      setImage(null)
                      setImageError(null)
                      setSaved(false)
                    }}
                  >
                    <Trash2 /> Remove
                  </Button>
                ) : null}
              </div>
            </div>
            <p className="mt-3 text-xs text-dim">JPEG, PNG or WebP up to 10 MB. Pictures are cropped to a square.</p>
            {imageError ? <Problem className="mt-2">{imageError}</Problem> : null}
          </section>

          <section className="space-y-4">
            <h2 className="rubric border-b border-edge pb-2">Details</h2>
            <div className="space-y-2">
              <Label htmlFor="profile-name">Display name</Label>
              <Input
                id="profile-name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value)
                  setSaved(false)
                  submit.clearError()
                }}
                maxLength={PROFILE_NAME_MAX_LENGTH}
                autoComplete="nickname"
                required
              />
              <p className="text-xs text-dim">Shown in battles, rosters and friend lists.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-email">Email</Label>
              <Input id="profile-email" value={me.email} readOnly className="text-dim" />
              <p className="text-xs text-dim">Private. Used to sign in.</p>
            </div>
          </section>

          <div className="flex flex-wrap items-center gap-3 border-t border-edge pt-4 md:col-span-2">
            <Button type="submit" disabled={!changed || !name.trim() || preparing || submit.busy}>
              {submit.busy ? 'Saving…' : 'Save profile'}
            </Button>
            {submit.error ? <Problem>{submit.error}</Problem> : null}
            {saved && !changed ? <output className="text-sm text-achieved">Profile saved.</output> : null}
          </div>
        </form>
        <AccountSecurity
          me={me}
          preferences={
            <div className="border border-edge bg-panel p-5 md:p-7">
              <SectionHeading title="Preferences" />
              <div className="mt-4">
                <PlayerDefaultsSettings />
              </div>
            </div>
          }
        />
      </PageContent>
    </main>
  )
}
