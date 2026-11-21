import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react"
import * as Notifications from "expo-notifications"
import { useRootNavigationState, useRouter } from "expo-router"
import { usersApi } from "@/api/users.api"
import {
  incrementCachedConversationUnread,
  updateCachedConversationLastMessage,
  useLocalDb,
} from "@/db"
import { getExpoPushToken } from "@/lib/expo-push-token"
import { useProfile } from "@/context/profile/ProfileContext"
import { truncatePreview } from "@repo/types/schema"
import { secureStorage } from "@repo/utils"

interface NotificationContextValue {
  notification: Notifications.Notification | undefined
}

const NotificationContext = createContext<NotificationContextValue | null>(null)

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { flow, user } = useProfile()
  const { db } = useLocalDb()
  const ready = flow === "ready"
  const router = useRouter()
  const rootNavigationState = useRootNavigationState()
  const canNavigate = Boolean(rootNavigationState?.key)

  const [notification, setNotification] = useState<Notifications.Notification | undefined>()

  const pendingResponse = useRef<Notifications.NotificationResponse | null>(null)
  const handledResponseIds = useRef(new Set<string>())
  const syncedPushToken = useRef<string | null>(null)

  const syncPushToken = useCallback(async () => {
    if (!ready) return

    const [expoPushToken, sessionId] = await Promise.all([
      getExpoPushToken({ requestPermission: true }),
      secureStorage.getSessionId(),
    ])
    if (!expoPushToken || !sessionId) return

    // One call per session per launch; a new login has a new sessionId.
    const syncKey = `${sessionId}:${expoPushToken}`
    if (syncedPushToken.current === syncKey) return

    try {
      await usersApi.updateSessionPushToken({ sessionId, expoPushToken })
      syncedPushToken.current = syncKey
    } catch (error) {
      console.warn("[notifications] failed to save push token", error)
    }
  }, [ready])

  // Register the push token exactly once per app launch, when ready.
  useEffect(() => {
    if (!ready) return
    void syncPushToken()
  }, [ready, syncPushToken])

  const openConversationFromResponse = useCallback(
    (response: Notifications.NotificationResponse | null) => {
      if (!response) return
      if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return

      if (!ready || !canNavigate) {
        if (flow === "loading" || flow === "unverified") pendingResponse.current = response
        return
      }

      pendingResponse.current = null

      const responseId = response.notification.request.identifier
      if (handledResponseIds.current.has(responseId)) return

      const data = response.notification.request.content.data as
        { conversationId?: unknown } | undefined
      const conversationId =
        typeof data?.conversationId === "string" && data.conversationId.length > 0
          ? data.conversationId
          : undefined
      if (!conversationId) return

      handledResponseIds.current.add(responseId)
      void Notifications.clearLastNotificationResponseAsync()

      const name = response.notification.request.content.title?.trim()

      router.push({
        pathname: "/conversation/[id]",
        params: {
          id: conversationId,
          ...(name ? { name } : {}),
        },
      })
    },
    [canNavigate, flow, ready, router],
  )

  // Tap while the app is foreground/background.
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      openConversationFromResponse,
    )
    return () => subscription.remove()
  }, [openConversationFromResponse])

  // Tap that launched a killed app.
  useEffect(() => {
    if (!ready || !canNavigate) return

    let cancelled = false
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!cancelled) openConversationFromResponse(response)
    })

    return () => {
      cancelled = true
    }
  }, [canNavigate, openConversationFromResponse, ready])

  // Flush a tap received while auth/profile were still restoring.
  useEffect(() => {
    if (ready && canNavigate && pendingResponse.current) {
      openConversationFromResponse(pendingResponse.current)
    }
  }, [canNavigate, openConversationFromResponse, ready])

  // Never open a previous user's chat after sign-out.
  useEffect(() => {
    if (flow === "signedOut" || flow === "onboarding") pendingResponse.current = null
  }, [flow])

  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener((next) => {
      setNotification(next)

      // A push can arrive while the app is backgrounded, so there is no
      // realtime event to keep the chat list's last-message row current.
      const data = next.request.content.data as
        | { conversationId?: unknown; messageId?: unknown; messageType?: unknown }
        | undefined
      const conversationId =
        typeof data?.conversationId === "string" && data.conversationId.length > 0
          ? data.conversationId
          : undefined
      const ownerUserId = user?.userId
      if (!conversationId || !ownerUserId) return

      const body = next.request.content.body
      const messageType = typeof data?.messageType === "string" ? data.messageType : undefined
      const fullPreview = messageType === "TEXT" && body ? body : (body ?? "New message")
      const preview = truncatePreview(fullPreview)

      void updateCachedConversationLastMessage(db, {
        ownerUserId,
        conversationId,
        ...(typeof data?.messageId === "string" ? { lastMessageId: data.messageId } : {}),
        lastMessagePreview: preview,
        lastMessageAt: Date.now(),
      }).catch((error) => {
        console.warn("[db] failed to update notification conversation", error)
      })

      // The push itself means this message has not been seen yet.
      void incrementCachedConversationUnread(db, ownerUserId, conversationId).catch((error) => {
        console.warn("[db] failed to increment notification unread", error)
      })
    })
    return () => subscription.remove()
  }, [db, user?.userId])

  const value = useMemo<NotificationContextValue>(() => ({ notification }), [notification])
  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>
}
