import { useCallback, useEffect, useRef } from "react"
import { AppState } from "react-native"
import { useFocusEffect } from "expo-router"
import { WS_USER_ACTION, WS_USER_OP } from "@repo/types/schema"
import { useWs } from "@/context/WebSocketContext"

type ActiveStatus = "OPENED" | "CLOSED"

export function useActiveConversation(conversationId: string) {
  const { send, status } = useWs()
  const focused = useRef(false)
  const appActive = useRef(
    AppState.currentState !== "background" && AppState.currentState !== "inactive",
  )

  const notify = useCallback(
    (next: ActiveStatus) => {
      if (!conversationId) return
      send({
        action: WS_USER_ACTION,
        op: WS_USER_OP.conversation,
        data: { conversationId, status: next },
      })
    },
    [conversationId, send],
  )

  useFocusEffect(
    useCallback(() => {
      focused.current = true
      if (appActive.current) notify("OPENED")

      return () => {
        focused.current = false
        notify("CLOSED")
      }
    }, [notify]),
  )

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      const isActive = next === "active"
      if (isActive === appActive.current) return

      appActive.current = isActive
      if (focused.current) notify(isActive ? "OPENED" : "CLOSED")
    })

    return () => subscription.remove()
  }, [notify])

  useEffect(() => {
    if (status === "connected" && focused.current && appActive.current) notify("OPENED")
  }, [status, notify])
}
