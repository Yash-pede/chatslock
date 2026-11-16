import { useCallback, useMemo, useRef, useState, type MutableRefObject } from "react"
import { useFocusEffect } from "expo-router"
import { getPeerUserId } from "@repo/types/schema"
import { USER_EVENT, userPublishEnvelopeSchema, type PeerUserStatus } from "@repo/types/req"
import { useRealtime } from "@/context/RealtimeContext"
import { useLocalDb } from "@/db"
import { updateCachedProfileStatus } from "@/db/profiles"
import { userChannel } from "@/lib/realtime"

export interface PeerPresence {
  /** Latest status received on the peer's user channel. */
  status: PeerUserStatus | null
  /** Local timestamp captured when an OFFLINE event arrives. */
  lastActiveAt: number | null
  /**
   * Same values as refs, for API calls that started before the event and
   * resolve after it; they use these instead of overwriting the live state.
   */
  statusRef: MutableRefObject<PeerUserStatus | null>
  lastActiveAtRef: MutableRefObject<number | null>
}

/**
 * Live presence for the peer of the open DIRECT conversation.
 *
 * The initial value still comes from the profile API. This only subscribes to
 * `/user/<peerId>` and applies `user.status` events; the backend writes the
 * active-conversation presence when either side subscribes to the chat.
 */
export function usePeerPresence(
  conversationId: string,
  currentUserId: string | null,
): PeerPresence {
  const { subscribe } = useRealtime()
  const { db } = useLocalDb()
  const [status, setStatus] = useState<PeerUserStatus | null>(null)
  const [lastActiveAt, setLastActiveAt] = useState<number | null>(null)
  const statusRef = useRef<PeerUserStatus | null>(null)
  const lastActiveAtRef = useRef<number | null>(null)

  const peerId = useMemo(
    () => (currentUserId ? getPeerUserId(conversationId, currentUserId) : null),
    [conversationId, currentUserId],
  )

  // The user namespace only authorizes subscriptions to DIRECT peers.
  const direct = conversationId.startsWith("DIRECT#")

  useFocusEffect(
    useCallback(() => {
      if (!peerId || !direct) return

      const unsubscribe = subscribe(userChannel(peerId), (event) => {
        const parsed = userPublishEnvelopeSchema.safeParse(event)
        if (!parsed.success || parsed.data.eventType !== USER_EVENT.status) return

        const next = parsed.data.data.userStatus
        // The event only carries the status, so the moment we receive OFFLINE
        // is the most accurate local "last active" timestamp.
        const offlineAt = next === "OFFLINE" ? Date.now() : null

        statusRef.current = next
        lastActiveAtRef.current = offlineAt
        setStatus(next)
        setLastActiveAt(offlineAt)

        // Keep the chat list's cached profile in sync with the live header.
        void updateCachedProfileStatus(db, peerId, next, offlineAt ?? undefined).catch((error) => {
          console.warn("[db] failed to update cached presence", error)
        })
      })

      return () => {
        unsubscribe()
        statusRef.current = null
        lastActiveAtRef.current = null
        setStatus(null)
        setLastActiveAt(null)
      }
    }, [db, direct, peerId, subscribe]),
  )

  return { status, lastActiveAt, statusRef, lastActiveAtRef }
}
