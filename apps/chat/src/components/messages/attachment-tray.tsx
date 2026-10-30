import type { ReactNode } from "react"
import { Modal, Pressable, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Text, useThemeColors } from "@repo/ui"

export interface TrayAction {
  key: string
  label: string
  icon: ReactNode
  /** Colour of the icon's circular background. */
  tint: string
  onPress: () => void
}

export interface AttachmentTrayProps {
  visible: boolean
  actions: TrayAction[]
  onClose: () => void
}

/**
 * Telegram-style attachment tray: a bottom panel of large icon buttons over a
 * scrim. Purely presentational — the caller supplies the actions.
 */
export function AttachmentTray({ visible, actions, onClose }: AttachmentTrayProps) {
  const insets = useSafeAreaInsets()
  const colors = useThemeColors()

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        <Pressable
          className="absolute inset-0 bg-black/40"
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close attachments"
        />

        <View
          className="rounded-t-3xl border-t border-border bg-card px-4 pt-3"
          style={{ paddingBottom: insets.bottom + 20 }}
        >
          <View
            className="mb-6 h-1 w-10 self-center rounded-full"
            style={{ backgroundColor: colors.border }}
          />
          <View className="flex-row justify-around">
            {actions.map((action) => (
              <Pressable
                key={action.key}
                onPress={() => {
                  onClose()
                  action.onPress()
                }}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                className="w-24 items-center gap-2 active:opacity-70"
              >
                <View
                  className="h-14 w-14 items-center justify-center rounded-full"
                  style={{ backgroundColor: action.tint }}
                >
                  {action.icon}
                </View>
                <Text variant="small" className="text-center font-normal text-muted-foreground">
                  {action.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  )
}
