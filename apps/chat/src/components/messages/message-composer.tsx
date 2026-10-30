import { useRef, useState } from "react"
import { Alert, Pressable, TextInput, useColorScheme, type TextInputInstance, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import * as ImagePicker from "expo-image-picker"
import * as DocumentPicker from "expo-document-picker"
import {
  FileText,
  Image as ImageIcon,
  Music,
  Paperclip,
  SendHorizontal,
} from "lucide-react-native"
import { useToast, useThemeColors } from "@repo/ui"
import { AttachmentTray, type TrayAction } from "@/components/messages/attachment-tray"
import type { PickedMedia } from "@/components/messages/types"

export interface MessageComposerProps {
  onSend: (text: string) => void | Promise<void>
  onSendMedia?: (media: PickedMedia) => void | Promise<void>
  disabled?: boolean
  emojiOpen?: boolean
  onEmojiOpenChange?: (open: boolean) => void
}

export function MessageComposer({
  onSend,
  onSendMedia,
  disabled = false,
}: MessageComposerProps) {
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const dark = useColorScheme() === "dark"
  const { toast } = useToast()
  const inputRef = useRef<TextInputInstance>(null)
  const [value, setValue] = useState("")
  const [trayOpen, setTrayOpen] = useState(false)
  const canSend = value.trim().length > 0 && !disabled

  const submit = async () => {
    const text = value.trim()
    if (!text) return
    await onSend(text)
    setValue("")
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

        <Pressable
          onPress={() => void submit()}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel="Send message"
          className={`h-10 w-10 items-center justify-center rounded-full ${
            canSend ? "bg-primary" : "bg-secondary"
          }`}
        >
          <SendHorizontal
            size={18}
            color={canSend ? colors.primaryForeground : colors.mutedForeground}
          />
        </Pressable>
      </View>

      <AttachmentTray
        visible={trayOpen}
        actions={attachActions}
        onClose={() => setTrayOpen(false)}
      />
    </View>
  )
}
