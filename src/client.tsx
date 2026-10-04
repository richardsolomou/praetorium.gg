import { StrictMode, startTransition } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { StartClient } from '@tanstack/react-start/client'
import { readAppSnapshot } from './client/offline/appStorage'

void readAppSnapshot()
  .catch(() => null)
  .then((snapshot) => {
    window.PraetoriumAppSnapshot = snapshot ?? undefined
    if (window.PraetoriumOffline) {
      void import('./client/offline/entry')
    } else {
      startTransition(() => {
        hydrateRoot(
          document,
          <StrictMode>
            <StartClient />
          </StrictMode>,
        )
      })
    }
  })
