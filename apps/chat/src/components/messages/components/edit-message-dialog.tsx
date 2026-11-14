import { useState } from "react"
import { KeyboardAvoidingView, Modal, Platform, Pressable, TextInput, View } from "react-native"
import { Button, Text, useThemeColors } from "@repo/ui"
import { MAX_MESSAGE_LENGTH } from "@repo/types/schema"
import type { ChatMessage } from "../types"

/** Modal for editing a text message in place; Save is disabled until it changes. */
export function EditMessageDialog({
  message,
  onCancel,
  onSave,
}: {
  message: ChatMessage
  onCancel: () => void
  onSave: (text: string) => void
}) {
  const colors = useThemeColors()
  // Mounted per target, so the initial value is always the selected message.
  const [text, setText] = useState(message.text ?? "")

  const trimmed = text.trim()
  const canSave =
    trimmed.length > 0 && trimmed !== (message.text ?? "") && text.length <= MAX_MESSAGE_LENGTH

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <Pressable
          onPress={onCancel}
          className="flex-1 items-center justify-center bg-black/40 px-5"
        >
          {/* Absorb taps on the card so only the backdrop closes the dialog. */}
          <Pressable
            onPress={() => undefined}
            className="w-full max-w-md gap-4 rounded-2xl bg-background p-5"
          >
            <Text variant="large">Edit message</Text>

            <TextInput
              value={text}
              onChangeText={setText}
              multiline
              autoFocus
              maxLength={MAX_MESSAGE_LENGTH}
              placeholder="Message"
              placeholderTextColor={colors.mutedForeground}
              selectionColor={colors.primary}
              className="max-h-40 min-h-20 rounded-xl bg-secondary p-3 text-foreground"
              style={{ textAlignVertical: "top" }}
            />

            <View className="flex-row justify-end gap-2">
              <Button variant="ghost" onPress={onCancel}>
                Cancel
              </Button>
              <Button onPress={() => onSave(trimmed)} disabled={!canSave}>
                Save
              </Button>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  )
}
