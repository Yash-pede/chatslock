import * as Crypto from "expo-crypto"
import * as SecureStore from "expo-secure-store"

/** Secure-store key for this installation's device id. */
const DEVICE_ID_KEY = "device_id"

let pending: Promise<string> | null = null

/**
 * Stable UUID for this installation. It is created once, kept in secure
 * storage across launches, and sent with every push-token registration so the
 * backend can update one device instead of creating duplicates.
 */
export function getDeviceId(): Promise<string> {
  pending ??= readOrCreateDeviceId().catch((error) => {
    // Allow a retry after a transient secure-storage failure.
    pending = null
    throw error
  })
  return pending
}

async function readOrCreateDeviceId(): Promise<string> {
  const stored = await SecureStore.getItemAsync(DEVICE_ID_KEY)
  if (stored) return stored

  const created = Crypto.randomUUID()
  await SecureStore.setItemAsync(DEVICE_ID_KEY, created)
  return created
}
