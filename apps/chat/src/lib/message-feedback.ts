import * as Haptics from "expo-haptics"
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio"

/** Bundled one-shot notification sounds. `require` must stay static for Metro. */
const SOUND_SOURCE = {
  sent: require("../../assets/files/notifications/msg_sent.mp3"),
  received: require("../../assets/files/notifications/msg_received.mp3"),
} as const

export type MessageFeedback = keyof typeof SOUND_SOURCE
export type MessageFeedbackOutcome = "success" | "warning" | "error"

const OUTCOME_HAPTIC = {
  success: Haptics.NotificationFeedbackType.Success,
  warning: Haptics.NotificationFeedbackType.Warning,
  error: Haptics.NotificationFeedbackType.Error,
} as const

// Players are created once at module load so their sources have finished
// loading by the time the first message arrives. A lazily created player
// silently drops the first sound: play() before the source loads is a no-op.
const players: Record<MessageFeedback, AudioPlayer> = {
  sent: createAudioPlayer(SOUND_SOURCE.sent),
  received: createAudioPlayer(SOUND_SOURCE.received),
}

// Feedback sounds must play even with the iOS silent switch on. The recorder
// sets its own mode while recording and restores playsInSilentMode afterwards,
// so this is idempotent.
let audioModeReady: Promise<void> | null = null
const ensureAudioMode = (): Promise<void> => {
  audioModeReady ??= setAudioModeAsync({ playsInSilentMode: true })
    .then(() => undefined)
    .catch(() => undefined)
  return audioModeReady
}

/**
 * One-shot feedback for a delivered message: a success haptic plus the
 * sent/received sound. Each play seeks back to the start first, so a burst of
 * messages replays from the beginning instead of stacking or double-playing.
 */
export function playMessageFeedback(kind: MessageFeedback): void {
  playMessageHaptic("success")

  void ensureAudioMode()
    .then(async () => {
      const player = players[kind]
      if (!player.isLoaded) return
      await player.seekTo(0).catch(() => undefined)
      player.play()
    })
    .catch((error) => {
      console.warn("[messages] failed to play message feedback", error)
    })
}

/**
 * Outcome haptic without a sound: `error` for failed sends/edits/deletes and
 * `warning` for blocked actions (offline, expired edit window). Keeping these
 * silent means an error is never mistaken for an incoming message.
 */
export function playMessageHaptic(outcome: MessageFeedbackOutcome): void {
  void Haptics.notificationAsync(OUTCOME_HAPTIC[outcome]).catch(() => undefined)
}
