import { definePlugin } from 'nitro'
import { app } from './app'

export default definePlugin(() => {
  void app().ready()
})
