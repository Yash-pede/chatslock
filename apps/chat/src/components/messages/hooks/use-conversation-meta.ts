import { useCallback, useEffect, useRef } from "react"
import { AppState } from "react-native"
import { useFocusEffect } from "expo-router"
import type { ClientConversationStatus } from "@repo/types/req"
import { usersApi } from "@/api/users.api"
import { useRealtime } from "@/context/RealtimeContext"

/** Refreshes the server's 10-minute active-conversation TTL without re-announcing. */
const OPENED_HEARTBEAT_MS = 5 * 60_000

/**
 * Reports whether this conversation is actually on screen.
 *
 * OPENED stores the server-side active conversation (profiles + push
 * suppression). CLOSED clears it and makes the users Lambda publish OFFLINE to
 * the user's channel. The heartbeat keeps long sessions alive; force-kills and
 * network loss fall back to the active-conversation TTL.
 */
export function useConversationMeta(conversationId: string): void {
  const { online } = useRealtime()
  const focused = useRef(false)
  const appActive = useRef(AppState.currentState === "active")
  const onlineRef = useRef(online)
  const lastStatus = useRef<ClientConversationStatus | null>(null)

  useEffect(() => {
    onlineRef.current = online
  }, [online])

  const notify = useCallback(
    (status: ClientConversationStatus) => {
      if (!conversationId) return
      // Focus and the online effect can both fire on mount; only one OPENED
      // should announce ONLINE. Heartbeats and CLOSED are not deduped.
      if (status === "OPENED" && lastStatus.current === "OPENED") return

      lastStatus.current = status
      void usersApi.setConversationMeta({ conversationId, status }).catch(() => {
        if (lastStatus.current === status) lastStatus.current = null
      })
    },
    [conversationId],
  )

  // Leaving the chat (back navigation, tab change, unmount) clears presence.
  useFocusEffect(
    useCallback(() => {
      focused.current = true
      if (appActive.current && onlineRef.current) notify("OPENED")

      return () => {
        focused.current = false
        notify("CLOSED")
      }
    }, [notify]),
  )

  // Backgrounding the app should show the user offline; foregrounding while
  // this screen is still focused marks them active again.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      const active = next === "active"
      if (active === appActive.current) return

      appActive.current = active
      if (!focused.current) return

      if (active) {
        if (onlineRef.current) notify("OPENED")
      } else {
        notify("CLOSED")
      }
    })

    return () => subscription.remove()
  }, [notify])

  // A reconnect while the chat is open must re-establish presence; the
  // realtime subscribe carries the live message stream, not presence anymore.
  useEffect(() => {
    if (online && focused.current && appActive.current) notify("OPENED")
  }, [notify, online])

  // Long sessions outlive the cache TTL, so refresh it periodically without
  // publishing a second ONLINE event.
  useEffect(() => {
    if (!online) return

    const timer = setInterval(() => {
      if (focused.current && appActive.current) notify("HEARTBEAT")
    }, OPENED_HEARTBEAT_MS)

    return () => clearInterval(timer)
  }, [notify, online])
}
