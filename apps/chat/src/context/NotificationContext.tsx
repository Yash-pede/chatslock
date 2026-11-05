import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react"
import * as Notifications from "expo-notifications"
import { useRootNavigationState, useRouter } from "expo-router"
import { usersApi } from "@/api/users.api"
import { getExpoPushToken } from "@/lib/expo-push-token"
import { useProfile } from "@/context/profile/ProfileContext"

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
  const { flow } = useProfile()
  const ready = flow === "ready"
  const router = useRouter()
  const rootNavigationState = useRootNavigationState()
  const canNavigate = Boolean(rootNavigationState?.key)

  const [notification, setNotification] = useState<Notifications.Notification | undefined>()

  const pendingResponse = useRef<Notifications.NotificationResponse | null>(null)
  const handledResponseIds = useRef(new Set<string>())

  const syncPushToken = useCallback(async () => {
    if (!ready) return
    const expoPushToken = await getExpoPushToken({ requestPermission: true })
    if (!expoPushToken) return

    try {
      await usersApi.setPushToken({ expoPushToken })
    } catch (error) {
      console.warn("[notifications] failed to save push token", error)
    }
  }, [ready])

  // Register the token once per app launch, when the profile is ready.
  useEffect(() => {
    if (!ready) return
    void syncPushToken()
  }, [ready, syncPushToken])

  // FCM/APNs rotate the device token independently of app launches. Without
  // this, the backend keeps a stale Expo token and later pushes fail with
  // DeviceNotRegistered even though FCM accepted the first one.
  useEffect(() => {
    if (!ready) return

    const subscription = Notifications.addPushTokenListener(() => {
      void syncPushToken()
    })

    return () => subscription.remove()
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
    const subscription = Notifications.addNotificationReceivedListener(setNotification)
    return () => subscription.remove()
  }, [])

  const value = useMemo<NotificationContextValue>(() => ({ notification }), [notification])
  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>
}
