import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { ImagePlus, ShieldCheck, Trash2 } from 'lucide-react'
import { useAuthAction } from 'ras-stack/auth/react'
import { useEffect, useRef, useState } from 'react'
import posthog from 'posthog-js'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PROFILE_NAME_MAX_LENGTH } from '../authConfig'
import { authClient } from '../client/authClient'
import { AccountSecurity } from '../client/components/AccountSecurity'
import { PlayerAvatar } from '../client/components/PlayerAvatar'
import { SignInRequired } from '../client/components/SignInRequired'
import { battlesQuery, friendshipsQuery, meQuery, opponentsQuery } from '../client/queries'
import { errorMessage } from '../client/queryClient'
import { prepareProfileImage } from '../client/profileImage'

export const Route = createFileRoute('/profile')({
  loader: ({ context }) => context.queryClient.ensureQueryData(meQuery()),
  component: Profile,
})

function Profile() {
  const { data: me } = useQuery(meQuery())
  if (!me) return <SignInRequired title="Your profile" explanation="Sign in to edit your profile." />
  return <ProfileForm me={me} />
}

function ProfileForm({ me }: { me: NonNullable<Awaited<ReturnType<NonNullable<ReturnType<typeof meQuery>['queryFn']>>>> }) {
  const [name, setName] = useState(me.name)
  const [image, setImage] = useState(me.image)
  const [imageError, setImageError] = useState<string | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [saved, setSaved] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()
  const submit = useAuthAction({ failureMessage: errorMessage })

  useEffect(() => {
    setName(me.name)
    setImage(me.image)
  }, [me.image, me.name])

  const changed = name.trim() !== me.name || image !== me.image
  const save = async () => {
    setSaved(false)
    const result = await submit.run(() => authClient.updateUser({ name: name.trim(), image }))
    if (result.error) return
    await queryClient.invalidateQueries({ queryKey: meQuery().queryKey })
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: battlesQuery().queryKey }),
      queryClient.invalidateQueries({ queryKey: friendshipsQuery().queryKey }),
      queryClient.invalidateQueries({ queryKey: opponentsQuery().queryKey }),
      queryClient.invalidateQueries({ queryKey: ['user-profile'] }),
    ])
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
      setImageError(error instanceof Error ? error.message : 'The profile picture could not be prepared.')
    } finally {
      setPreparing(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  return (
    <main className="ph-no-capture w-full">
      <section className="relative overflow-hidden border-b border-edge bg-panel">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,transparent_35%,color-mix(in_srgb,var(--color-parchment)_8%,transparent),transparent_75%)]" />
        <div className="relative mx-auto flex max-w-5xl items-center gap-4 px-3 py-5 sm:px-4 sm:py-7">
          <span className="grid size-12 shrink-0 place-items-center rounded-full border border-edge-strong bg-sunken text-parchment">
            <ShieldCheck className="size-5" aria-hidden />
          </span>
          <div>
            <p className="eyebrow text-parchment">Your account</p>
            <h1 className="text-3xl">Profile</h1>
            <p className="mt-1 text-sm text-dim">Choose how your name and picture appear to the people you play with.</p>
          </div>
        </div>
      </section>

      <form
        className="mx-auto mt-4 grid max-w-5xl gap-8 border-y border-edge bg-panel p-5 sm:border md:grid-cols-2 md:p-7"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <section>
          <p className="rubric border-b border-edge pb-2">Profile picture</p>
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
          {imageError ? <p className="mt-2 text-sm text-destructive">{imageError}</p> : null}
        </section>

        <section className="space-y-4">
          <p className="rubric border-b border-edge pb-2">Details</p>
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
              className="rounded-none border-edge bg-sunken"
            />
            <p className="text-xs text-dim">This is the name shown in battles, rosters and friend lists.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-email">Email</Label>
            <Input id="profile-email" value={me.email} readOnly className="rounded-none border-edge bg-sunken text-dim" />
            <p className="text-xs text-dim">Your email is private and used to sign in.</p>
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-3 border-t border-edge pt-4 md:col-span-2">
          <Button type="submit" disabled={!changed || !name.trim() || preparing || submit.busy}>
            {submit.busy ? 'Saving…' : 'Save profile'}
          </Button>
          {submit.error ? <p className="text-sm text-destructive">{submit.error}</p> : null}
          {saved ? <output className="text-sm text-achieved">Profile saved.</output> : null}
        </div>
      </form>
      <AccountSecurity me={me} />
    </main>
  )
}
