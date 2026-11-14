import { useCallback, useEffect, useState } from "react"
import NetInfo, { type NetInfoState } from "@react-native-community/netinfo"

/**
 * Explicit connectivity state for the auth gate. `unknown` means NetInfo has
 * not produced an answer yet; it is never treated as online, so an offline
 * launch cannot flash or expose the login screens.
 */
export type NetworkStatus = "unknown" | "online" | "offline"

/** Fail-closed: only an explicit connected + reachable state counts as online. */
const isOnline = (state: NetInfoState) =>
  state.isConnected === true && state.isInternetReachable === true

export function useNetworkStatus() {
  const [status, setStatus] = useState<NetworkStatus>("unknown")
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    const apply = (state: NetInfoState) => {
      // A null intermediate state keeps the current status (fail-closed once
      // offline) instead of unlocking the gate during a re-check.
      if (state.isConnected === false || state.isInternetReachable === false) {
        setStatus("offline")
      } else if (isOnline(state)) {
        setStatus("online")
      }
    }

    const unsubscribe = NetInfo.addEventListener(apply)
    void NetInfo.fetch().then(apply)
    return unsubscribe
  }, [])

  const retry = useCallback(async () => {
    setChecking(true)
    try {
      await NetInfo.refresh()
      const state = await NetInfo.fetch()
      setStatus(isOnline(state) ? "online" : "offline")
    } finally {
      setChecking(false)
    }
  }, [])

  return { status, checking, retry }
}
