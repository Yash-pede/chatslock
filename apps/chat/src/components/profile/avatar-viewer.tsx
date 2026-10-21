import { Image } from "expo-image";
import { Modal, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { Text } from "@repo/ui";

export interface AvatarViewerProps {
  visible: boolean;
  uri?: string | null;
  name: string;
  onClose: () => void;
}

/** Full-screen avatar preview on a scrim; tap the backdrop or the close button to dismiss. */
export function AvatarViewer({ visible, uri, name, onClose }: AvatarViewerProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View className="flex-1 items-center justify-center bg-black/90">
        <Pressable
          className="absolute inset-0"
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close photo"
        />

        <Pressable
          onPress={onClose}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close"
          className="absolute end-5 h-10 w-10 items-center justify-center rounded-full bg-white/10 active:opacity-70"
          style={{ top: insets.top + 12 }}
        >
          <X size={22} color="#ffffff" />
        </Pressable>

        {uri ? (
          <Image
            source={{ uri }}
            style={{ width: "88%", aspectRatio: 1, borderRadius: 24 }}
            contentFit="contain"
            transition={150}
            accessibilityLabel={`${name}'s photo`}
          />
        ) : (
          <Text className="text-white">No photo to show</Text>
        )}

        <View
          className="absolute inset-x-0 items-center px-8"
          style={{ bottom: insets.bottom + 24 }}
        >
          <Text className="text-base font-medium text-white/90">{name}</Text>
        </View>
      </View>
    </Modal>
  );
}
