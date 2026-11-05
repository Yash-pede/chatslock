import * as Notifications from "expo-notifications"
import { AndroidImportance } from "expo-notifications"
import Constants from "expo-constants"
import { Platform } from "react-native"

/**
 * Reads the Expo push token from the Expo SDK. Only `requestPermission` asks
 * the user (used on app open); sign-out just reads an already-granted token and
 * never prompts.
 */
export async function getExpoPushToken({
  requestPermission = false,
} = {}): Promise<string | null> {
  if (Platform.OS === "web") return null

  if (requestPermission && Platform.OS === "android") {
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
      : requestPermission
        ? (await Notifications.requestPermissionsAsync()).status
        : existingStatus

  if (finalStatus !== "granted") return null

  const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId
  if (!projectId) return null

  try {
    return (await Notifications.getExpoPushTokenAsync({ projectId })).data
  } catch {
    return null
  }
}
