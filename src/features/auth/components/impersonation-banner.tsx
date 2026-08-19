import { useRouter } from '@tanstack/react-router'
import { useState } from 'react'

import type { CurrentSession } from '@/features/auth/server/auth.functions'
import { stopImpersonating } from '@/features/auth/server/auth.functions'

// Fixed bottom bar shown only while the current session is an impersonation.
// The admin plugin sets session.impersonatedBy when an admin impersonates
// someone; this lets them drop back into their own account.
export function ImpersonationBanner({ session }: { session: CurrentSession }) {
  const router = useRouter()
  const [stopping, setStopping] = useState(false)

  if (!session?.session.impersonatedBy) return null

  async function stop() {
    setStopping(true)
    await stopImpersonating()
    // Re-run route loaders so the server-rendered session (menu, etc.)
    // reflects the admin again rather than the impersonated user.
    await router.invalidate()
    setStopping(false)
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-foreground/10 bg-foreground text-background">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2.5 text-sm">
        <span className="truncate">
          Impersonating user:{' '}
          <span className="font-medium">{session.user.email}</span>
        </span>
        <button
          type="button"
          disabled={stopping}
          onClick={() => void stop()}
          className="shrink-0 rounded-md bg-background/15 px-2.5 py-1 text-xs font-medium transition-colors hover:bg-background/25 disabled:opacity-50"
        >
          {stopping ? 'Stopping' : 'Stop impersonating'}
        </button>
      </div>
    </div>
  )
}
