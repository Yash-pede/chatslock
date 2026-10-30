import { useCallback, useEffect, useState } from "react"
import { Linking } from "react-native"
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder as useExpoAudioRecorder,
} from "expo-audio"
import { File } from "expo-file-system"

export interface RecordedAudio {
  uri: string
  durationMs: number
  sizeBytes: number
}

export interface AudioRecorder {
  isRecording: boolean
  /** Recent mic levels (`0..1`, oldest first) for the live waveform. */
  levels: number[]
  durationMs: number
  /** Requests permission and starts recording. Resolves `false` if denied. */
  start: () => Promise<boolean>
  /** Stops and returns the recording, or `null` if nothing was captured. */
  stop: () => Promise<RecordedAudio | null>
  /** Stops and discards the recording. */
  cancel: () => Promise<void>
}

/** How many metering samples the live waveform keeps. */
const MAX_LEVELS = 48
/** How often duration + metering are sampled, in ms. */
const STATUS_INTERVAL_MS = 100

/** Maps the recorder's dB metering (`-160..0`) onto `0..1`. */
function levelFromMetering(metering: number | undefined): number {
  if (metering == null) return 0
  return Math.max(0, Math.min(1, (metering + 60) / 60))
}

/**
 * Microphone recording with a live level meter for the composer. Uses
 * `expo-audio`; metering is enabled so the waveform reacts to the voice.
 */
export function useAudioRecorder(): AudioRecorder {
  const [isRecording, setIsRecording] = useState(false)
  const [durationMs, setDurationMs] = useState(0)
  const [levels, setLevels] = useState<number[]>([])

  const recorder = useExpoAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
  })

  // Sample the recorder while recording (duration + mic level for the waveform).
  useEffect(() => {
    if (!isRecording) return

    const timer = setInterval(() => {
      const status = recorder.getStatus()
      setDurationMs(status.durationMillis)
      if (status.metering != null) {
        setLevels((previous) =>
          [...previous, levelFromMetering(status.metering)].slice(-MAX_LEVELS),
        )
      }
    }, STATUS_INTERVAL_MS)

    return () => clearInterval(timer)
  }, [isRecording, recorder])

  const start = useCallback(async () => {
    // Ask for the mic only when recording is actually requested.
    const permission = await AudioModule.requestRecordingPermissionsAsync()
    if (!permission.granted) {
      // If the OS won't prompt again, send the user to Settings to enable it.
      if (!permission.canAskAgain) await Linking.openSettings().catch(() => {})
      return false
    }

    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true })
    await recorder.prepareToRecordAsync()
    recorder.record()
    setLevels([])
    setDurationMs(0)
    setIsRecording(true)
    return true
  }, [recorder])

  const stopRecorder = useCallback(async () => {
    setIsRecording(false)
    try {
      if (recorder.isRecording) await recorder.stop()
    } catch {
      // Already stopped.
    } finally {
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {})
    }
  }, [recorder])

  const stop = useCallback(async (): Promise<RecordedAudio | null> => {
    const finalDurationMs = recorder.getStatus().durationMillis
    await stopRecorder()
    setLevels([])

    const uri = recorder.uri
    if (!uri) return null

    let sizeBytes = 0
    try {
      sizeBytes = new File(uri).size ?? 0
    } catch {
      // Size is best-effort; the upload still validates server-side.
    }
    return { uri, durationMs: finalDurationMs, sizeBytes }
  }, [recorder, stopRecorder])

  const cancel = useCallback(async () => {
    await stopRecorder()
    setLevels([])
  }, [stopRecorder])

  return { isRecording, levels, durationMs, start, stop, cancel }
}
