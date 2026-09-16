import { createFileRoute } from '@tanstack/react-router'
import { NativeMorePage } from '../client/components/NativeMorePage'

export const Route = createFileRoute('/more')({
  component: NativeMorePage,
})
