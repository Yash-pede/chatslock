import { useCallback, useRef, useState } from "react"
import { Platform } from "react-native"
import { Directory, File, Paths } from "expo-file-system"
import * as Legacy from "expo-file-system/legacy"
import * as SecureStore from "expo-secure-store"

/** Folder (under the app's documents directory) used on iOS. */
const DOWNLOAD_FOLDER = "chatslock"
/** Persisted SAF directory the user granted us on Android. */
const SAF_DIR_KEY = "chatslock.downloadDir"

export type DownloadState = "idle" | "downloading" | "done" | "error"
export type DownloadOutcome = "saved" | "cancelled" | "error"

type OnProgress = (data: { bytesWritten: number; totalBytes: number }) => void

export interface DocumentDownload {
  state: DownloadState
  /** 0..1, or `null` while the total size is unknown. */
  progress: number | null
  download: (input: { url: string; fileName: string; mimeType: string }) => Promise<DownloadOutcome>
}

/** iOS / fallback: download into `<app documents>/chatslock/` (shown in Files). */
async function saveToAppFolder(url: string, fileName: string, onProgress: OnProgress) {
  const directory = new Directory(Paths.document, DOWNLOAD_FOLDER)
  if (!directory.exists) directory.create({ intermediates: true, idempotent: true })
  const destination = new File(directory, fileName)
  await File.downloadFileAsync(url, destination, { idempotent: true, onProgress })
}

/** Asks the user to grant a folder (defaults to Downloads) and remembers it. */
async function promptForAndroidFolder(): Promise<string | null> {
  const permission = await Legacy.StorageAccessFramework.requestDirectoryPermissionsAsync()
  if (!permission.granted) return null
  await SecureStore.setItemAsync(SAF_DIR_KEY, permission.directoryUri)
  return permission.directoryUri
}

async function writeToSafFolder(
  directoryUri: string,
  url: string,
  fileName: string,
  mimeType: string,
  onProgress: OnProgress,
) {
  const temp = new File(Paths.cache, fileName)
  try {
    await File.downloadFileAsync(url, temp, { idempotent: true, onProgress })

    // Overwrite: SAF's create fails if the name exists, so drop the old file.
    const siblings = await Legacy.StorageAccessFramework.readDirectoryAsync(directoryUri)
    const existing = siblings.find((uri) => decodeURIComponent(uri).endsWith(`/${fileName}`))
    if (existing) {
      try {
        await Legacy.deleteAsync(existing, { idempotent: true })
      } catch {
        // A leftover file we can't delete just means create will fail loudly below.
      }
    }

    const target = await Legacy.StorageAccessFramework.createFileAsync(
      directoryUri,
      fileName,
      mimeType,
    )
    // SAF files are written through the string API (base64), not copyAsync.
    const base64 = await Legacy.readAsStringAsync(temp.uri, { encoding: "base64" })
    await Legacy.writeAsStringAsync(target, base64, { encoding: "base64" })
  } finally {
    try {
      temp.delete()
    } catch {
      // Temp cleanup is best-effort.
    }
  }
}

/** Android: save into the user-granted (public) folder, prompting once. */
async function saveToPublicFolder(
  url: string,
  fileName: string,
  mimeType: string,
  onProgress: OnProgress,
): Promise<DownloadOutcome> {
  const stored = await SecureStore.getItemAsync(SAF_DIR_KEY)
  const directoryUri = stored ?? (await promptForAndroidFolder())
  if (!directoryUri) return "cancelled"

  try {
    await writeToSafFolder(directoryUri, url, fileName, mimeType, onProgress)
    return "saved"
  } catch (error) {
    // A remembered grant can go stale (revoked, folder deleted): ask again once.
    if (stored) {
      await SecureStore.deleteItemAsync(SAF_DIR_KEY)
      return saveToPublicFolder(url, fileName, mimeType, onProgress)
    }
    throw error
  }
}

/**
 * Downloads an attachment where the user can find it:
 * - Android: a public folder the user grants once via the system picker
 *   (defaults to Downloads), remembered afterwards.
 * - iOS: the app's documents folder, exposed in the Files app.
 */
export function useDocumentDownload(): DocumentDownload {
  const [state, setState] = useState<DownloadState>("idle")
  const [progress, setProgress] = useState<number | null>(null)
  const runningRef = useRef(false)

  const download = useCallback(
    async ({ url, fileName, mimeType }: { url: string; fileName: string; mimeType: string }) => {
      if (!url || runningRef.current) return "error" as const
      runningRef.current = true
      setState("downloading")
      setProgress(0)

      const onProgress: OnProgress = ({ bytesWritten, totalBytes }) =>
        setProgress(totalBytes > 0 ? bytesWritten / totalBytes : null)

      try {
        const outcome: DownloadOutcome =
          Platform.OS === "android"
            ? await saveToPublicFolder(url, fileName, mimeType, onProgress)
            : await saveToAppFolder(url, fileName, onProgress).then(() => "saved")

        if (outcome === "cancelled") {
          setState("idle")
          return outcome
        }
        setProgress(1)
        setState("done")
        return outcome
      } catch (error) {
        console.warn("[download] failed", error)
        setState("error")
        return "error" as const
      } finally {
        runningRef.current = false
      }
    },
    [],
  )

  return { state, progress, download }
}
