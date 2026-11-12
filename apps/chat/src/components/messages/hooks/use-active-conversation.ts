import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AppState } from "react-native"
import { useFocusEffect } from "expo-router"
import { getPeerUserId } from "@repo/types/schema"
import {
  USER_EVENT,
  userPublishEnvelopeSchema,
  type ClientConversationStatus,
  type PeerUserStatus,
} from "@repo/types/req"
import { usersApi } from "@/api/users.api"
import { useRealtime } from "@/context/RealtimeContext"
import { userChannel } from "@/lib/realtime"

/**
 * Presence for the open conversation:
 * - reports `OPENED`/`CLOSED` to `POST /api/users/conversationMeta` (which also
 *   suppresses the peer's push while the conversation is open);
 * - publishes our `ONLINE`/`OFFLINE` on our own user channel;
 * - subscribes to the peer's user channel for their live status.
 */
export function useActiveConversation(conversationId: string, currentUserId: string | null) {
  const { publish, subscribe } = useRealtime()
  const [peerStatus, setPeerStatus] = useState<PeerUserStatus | undefined>(undefined)
  const focused = useRef(false)
  const appActive = useRef(AppState.currentState === "active")

  const peerId = useMemo(
    () => (currentUserId ? getPeerUserId(conversationId, currentUserId) : null),
    [conversationId, currentUserId],
  )

  /** REST presence: also returns the peer's status at the time of the call. */
  const notify = useCallback(
    (status: ClientConversationStatus) => {
      if (!conversationId) return
      void usersApi
        .setConversationMeta({ conversationId, status })
        .then((next) => {
          if (next) setPeerStatus(next)
        })
        .catch(() => undefined)
    },
    [conversationId],
  )

  const publishOwnStatus = useCallback(
    (userStatus: PeerUserStatus) => {
      if (!currentUserId) return
      void publish(userChannel(currentUserId), {
        eventType: USER_EVENT.status,
        data: { userStatus },
      }).catch(() => undefined)
    },
    [publish, currentUserId],
  )

  // Only our own channel can be published to; the peer's is read-only for us.
  useEffect(() => {
    if (!peerId) return

    return subscribe(userChannel(peerId), (event) => {
      const parsed = userPublishEnvelopeSchema.safeParse(event)
      if (parsed.success) setPeerStatus(parsed.data.data.userStatus)
    })
  }, [peerId, subscribe])

  useFocusEffect(
    useCallback(() => {
      focused.current = true
      if (appActive.current) {
        notify("OPENED")
        publishOwnStatus("ONLINE")
      }

      return () => {
        focused.current = false
        notify("CLOSED")
        publishOwnStatus("OFFLINE")
      }
    }, [notify, publishOwnStatus]),
  )

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      const isActive = next === "active"
      if (isActive === appActive.current) return

      appActive.current = isActive
      if (focused.current) {
        notify(isActive ? "OPENED" : "CLOSED")
        publishOwnStatus(isActive ? "ONLINE" : "OFFLINE")
      }
    })

    return () => subscription.remove()
  }, [notify, publishOwnStatus])

  return { peerStatus }
}
