import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react"
import * as Notifications from "expo-notifications"
import { AndroidImportance } from "expo-notifications"
import { useRootNavigationState, useRouter } from "expo-router"
import { AppState, Platform } from "react-native"
import Constants from "expo-constants"
import { usersApi } from "@/api/users.api"
import { getDeviceId } from "@/lib/device"
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

async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (Platform.OS === "web") return null

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FF231F7C",
    })
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync()
  const finalStatus =
    existingStatus === "granted"
      ? existingStatus
      : (await Notifications.requestPermissionsAsync()).status
  if (finalStatus !== "granted") return null

  const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId
  if (!projectId) return null

  try {
    return (await Notifications.getExpoPushTokenAsync({ projectId })).data
  } catch {
    return null
  }
}

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
    const expoPushToken = await registerForPushNotificationsAsync()
    if (!expoPushToken) return

    try {
      const deviceId = await getDeviceId()
      await usersApi.setPushToken({ expoPushToken, deviceId })
    } catch (error) {
      console.warn("[notifications] failed to save push token", error)
    }
  }, [ready])

  useEffect(() => {
    if (!ready) return
    void syncPushToken()
  }, [ready, syncPushToken])

  useEffect(() => {
    if (!ready) return
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void syncPushToken()
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
