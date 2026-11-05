import * as Device from "expo-device"
import { Platform } from "react-native"

export type SessionPlatform = "ios" | "android" | "web"

/**
 * Human-readable device metadata sent with sign-in so the sessions screen can
 * show which phone/tablet/browser each session belongs to.
 */
export function sessionDeviceInfo(): { deviceName: string; platform: SessionPlatform } {
  const platform: SessionPlatform =
    Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web"

  const deviceName =
    Device.modelName ?? Device.deviceName ?? (platform === "web" ? "Web browser" : "Unknown device")

  return { deviceName, platform }
}
