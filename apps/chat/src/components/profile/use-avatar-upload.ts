import { useState } from "react"
import * as ImagePicker from "expo-image-picker"
import { extractErrorMessage } from "@repo/utils"
import type { AvatarContentType } from "@repo/types/req"
import { usersApi } from "@/api/users.api"

const MIME_BY_EXTENSION: Record<string, AvatarContentType> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
}

const EXTENSION_BY_MIME: Record<AvatarContentType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
}

function resolveContentType(asset: ImagePicker.ImagePickerAsset): AvatarContentType | null {
  if (asset.mimeType && asset.mimeType in EXTENSION_BY_MIME) {
    return asset.mimeType as AvatarContentType
  }
  const extension = asset.fileName?.split(".").pop()?.toLowerCase()
  return extension ? (MIME_BY_EXTENSION[extension] ?? null) : null
}

/**
 * Picks and uploads a profile photo. Returns the new URL (or `null` when the
 * user cancels); failures surface through `error`.
 */
export function useAvatarUpload(onUploaded: (url: string) => Promise<void>) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pick = async (): Promise<string | null> => {
    setError(null)

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      setError("Photo access is needed to change your avatar.")
      return null
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    })
    const asset = result.canceled ? undefined : result.assets[0]
    if (!asset) return null

    const contentType = resolveContentType(asset)
    if (!contentType) {
      setError("Only JPEG, PNG or WebP images are supported.")
      return null
    }

    setUploading(true)
    try {
      const url = await usersApi.uploadAvatar({
        uri: asset.uri,
        contentType,
        fileName: asset.fileName ?? `avatar.${EXTENSION_BY_MIME[contentType]}`,
      })
      await onUploaded(url)
      return url
    } catch (e) {
      setError(extractErrorMessage(e))
      return null
    } finally {
      setUploading(false)
    }
  }

  return { pick, uploading, error, clearError: () => setError(null) }
}
