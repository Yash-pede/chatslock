import { useRef, useState } from "react"
import { Pressable, TextInput, useColorScheme, type TextInputInstance, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Paperclip, SendHorizontal, Smile } from "lucide-react-native"
import { useThemeColors } from "@repo/ui"

export interface MessageComposerProps {
  onSend: (text: string) => void | Promise<void>
  disabled?: boolean
  emojiOpen?: boolean
  onEmojiOpenChange?: (open: boolean) => void
}

export function MessageComposer({ onSend, disabled = false }: MessageComposerProps) {
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const dark = useColorScheme() === "dark"
  const inputRef = useRef<TextInputInstance>(null)
  const [value, setValue] = useState("")
  const canSend = value.trim().length > 0 && !disabled

  const submit = async () => {
    const text = value.trim()
    if (!text) return
    await onSend(text)
    setValue("")
  }

  return (
    <View
      className="border-t border-border bg-background"
      style={{ paddingBottom: insets.bottom - 12 }}
    >
      <View className="flex-row items-end gap-2 px-3 pt-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Attach"
          hitSlop={8}
          disabled
          className="h-10 w-10 items-center justify-center rounded-full opacity-40"
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
    </View>
  )
}
