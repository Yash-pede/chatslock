import { useRef, useState } from "react"
import {
  Alert,
  Pressable,
  TextInput,
  useColorScheme,
  type TextInputInstance,
  View,
} from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import * as ImagePicker from "expo-image-picker"
import * as DocumentPicker from "expo-document-picker"
import {
  FileText,
  Image as ImageIcon,
  Mic,
  Music,
  Paperclip,
  SendHorizontal,
  Trash2,
} from "lucide-react-native"
import { Text, Waveform, useToast, useThemeColors } from "@repo/ui"
import { AttachmentTray, type TrayAction } from "./attachment-tray"
import { useAudioRecorder, type RecordedAudio } from "../hooks/use-audio-recorder"
import type { PickedMedia } from "../types"

export interface MessageComposerProps {
  onSend: (text: string) => void | Promise<void>
  onSendMedia?: (media: PickedMedia) => void | Promise<void>
  onSendAudio?: (audio: RecordedAudio & { fileName: string; mimeType: string }) => void
  disabled?: boolean
  emojiOpen?: boolean
  onEmojiOpenChange?: (open: boolean) => void
}

/** Voice notes are recorded as AAC in an MP4 container (`m4a`). */
const VOICE_MIME = "audio/mp4"
/** Recordings shorter than this are treated as an accidental tap. */
const MIN_RECORDING_MS = 400

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, "0")}`
}

export function MessageComposer({
  onSend,
  onSendMedia,
  onSendAudio,
  disabled = false,
}: MessageComposerProps) {
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const dark = useColorScheme() === "dark"
  const { toast } = useToast()
  const recorder = useAudioRecorder()
  const inputRef = useRef<TextInputInstance>(null)
  const [value, setValue] = useState("")
  const [trayOpen, setTrayOpen] = useState(false)
  const canSend = value.trim().length > 0 && !disabled
  const recording = recorder.isRecording

  const submit = async () => {
    const text = value.trim()
    if (!text) return
    await onSend(text)
    setValue("")
  }

  const startRecording = async () => {
    const granted = await recorder.start()
    if (!granted) {
      toast({
        title: "Microphone access needed",
        description: "Allow microphone access to send voice messages.",
        variant: "destructive",
      })
    }
  }

  const stopAndSend = async () => {
    const recorded = await recorder.stop()
    if (!recorded || recorded.durationMs < MIN_RECORDING_MS) return
    onSendAudio?.({ ...recorded, fileName: `voice-${Date.now()}.m4a`, mimeType: VOICE_MIME })
  }

  const emitMedia = (
    uri: string,
    fileName: string,
    mimeType: string,
    sizeBytes: number,
    size?: { width?: number; height?: number },
  ) => {
    if (!onSendMedia) return
    void onSendMedia({ uri, fileName, mimeType, sizeBytes, ...size })
  }

  const pickImageOrVideo = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      Alert.alert("Media access needed", "Allow photo library access to send media.")
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      quality: 1,
    })
    const asset = result.canceled ? undefined : result.assets[0]
    if (!asset) return
    emitMedia(
      asset.uri,
      asset.fileName ?? "media",
      asset.mimeType ?? "application/octet-stream",
      asset.fileSize ?? 0,
      { width: asset.width, height: asset.height },
    )
  }

  const pickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      type: "*/*",
    })
    const asset = result.canceled ? undefined : result.assets[0]
    if (!asset) return
    emitMedia(
      asset.uri,
      asset.name ?? "document",
      asset.mimeType ?? "application/octet-stream",
      asset.size ?? 0,
    )
  }

  const attachActions: TrayAction[] = [
    {
      key: "media",
      label: "Photos & Videos",
      tint: "#7C5CFC",
      icon: <ImageIcon size={24} color="#ffffff" />,
      onPress: () => void pickImageOrVideo(),
    },
    {
      key: "document",
      label: "Document",
      tint: "#2AABEE",
      icon: <FileText size={24} color="#ffffff" />,
      onPress: () => void pickDocument(),
    },
    {
      key: "audio",
      label: "Audio",
      tint: "#F5A623",
      icon: <Music size={24} color="#ffffff" />,
      // Dummy for now: audio attachments are not implemented yet.
      onPress: () =>
        toast({ title: "Coming soon", description: "Audio attachments are not available yet." }),
    },
  ]

  return (
    <View
      className="border-t border-border bg-background"
      style={{ paddingBottom: insets.bottom - 12 }}
    >
      <View className="flex-row items-end gap-2 px-3 pt-2">
        {recording ? (
          <Pressable
            onPress={() => void recorder.cancel()}
            accessibilityRole="button"
            accessibilityLabel="Cancel recording"
            hitSlop={8}
            className="h-10 w-10 items-center justify-center rounded-full"
          >
            <Trash2 size={20} color={colors.destructive} />
          </Pressable>
        ) : (
          <Pressable
            onPress={() => setTrayOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Attach"
            hitSlop={8}
            disabled={!onSendMedia}
            className={`h-10 w-10 items-center justify-center rounded-full ${
              onSendMedia ? "" : "opacity-40"
            }`}
          >
            <Paperclip size={20} color={colors.mutedForeground} />
          </Pressable>
        )}

        {recording ? (
          <View className="min-h-10 flex-1 flex-row items-center gap-2 rounded-2xl bg-secondary px-3 py-2">
            <View className="h-2.5 w-2.5 rounded-full bg-destructive" />
            <Text className="text-xs" style={{ color: colors.mutedForeground }}>
              {formatDuration(recorder.durationMs)}
            </Text>
            <Waveform
              mode="livemic"
              levels={recorder.levels.length > 0 ? recorder.levels : [0.1]}
              color={colors.primary}
              barWidth={2.5}
              className="flex-1"
            />
          </View>
        ) : (
          <View className="min-h-10 flex-1 flex-row items-end rounded-2xl bg-secondary px-3 py-2">
            <TextInput
              ref={inputRef}
              value={value}
              onChangeText={setValue}
              placeholder="Message"
              placeholderTextColor={colors.mutedForeground}
              multiline
              maxLength={4000}
              className="max-h-28 flex-1 p-0 text-foreground"
              style={{ fontSize: 16 }}
              selectionColor={colors.primary}
              cursorColor={colors.primary}
              keyboardAppearance={dark ? "dark" : "light"}
            />
          </View>
        )}

        {recording ? (
          <Pressable
            onPress={() => void stopAndSend()}
            accessibilityRole="button"
            accessibilityLabel="Send voice message"
            className="h-10 w-10 items-center justify-center rounded-full bg-primary"
          >
            <SendHorizontal size={18} color={colors.primaryForeground} />
          </Pressable>
        ) : canSend ? (
          <Pressable
            onPress={() => void submit()}
            accessibilityRole="button"
            accessibilityLabel="Send message"
            className="h-10 w-10 items-center justify-center rounded-full bg-primary"
          >
            <SendHorizontal size={18} color={colors.primaryForeground} />
          </Pressable>
        ) : (
          <Pressable
            onPress={() => void startRecording()}
            disabled={!onSendAudio || disabled}
            accessibilityRole="button"
            accessibilityLabel="Record voice message"
            className={`h-10 w-10 items-center justify-center rounded-full ${
              onSendAudio && !disabled ? "bg-primary" : "bg-secondary"
            }`}
          >
            <Mic
              size={18}
              color={onSendAudio && !disabled ? colors.primaryForeground : colors.mutedForeground}
            />
          </Pressable>
        )}
      </View>

      <AttachmentTray
        visible={trayOpen}
        actions={attachActions}
        onClose={() => setTrayOpen(false)}
      />
    </View>
  )
}
