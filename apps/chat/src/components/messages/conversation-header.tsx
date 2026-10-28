import { router } from "expo-router"
import { ChevronLeft, MoreVertical } from "lucide-react-native"
import { Pressable, View } from "react-native"
import { Text, useThemeColors } from "@repo/ui"
import { UserAvatar } from "@/components/user-avatar"

/** Conversation top bar: back, peer identity, and options. */
export function ConversationHeader({ name, avatar }: { name: string; avatar?: string }) {
  const colors = useThemeColors()

  return (
    <View className="flex-row items-center gap-2 border-b border-border px-2 py-2">
      <Pressable
        onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Back to chats"
        className="h-10 w-10 items-center justify-center rounded-full active:bg-secondary"
      >
        <ChevronLeft size={24} color={colors.foreground} />
      </Pressable>

      <UserAvatar size={38} avatar={avatar} name={name} />

      <View className="flex-1 ps-1">
        <Text variant="large" numberOfLines={1} className="text-base">
          {name}
        </Text>
        <Text variant="small" numberOfLines={1} className="font-normal text-muted-foreground">
          Direct message
        </Text>
      </View>

      {/*<Pressable*/}
      {/*  accessibilityRole="button"*/}
      {/*  accessibilityLabel="Conversation options"*/}
      {/*  hitSlop={8}*/}
      {/*  className="h-10 w-10 items-center justify-center rounded-full active:bg-secondary"*/}
      {/*>*/}
      {/*  <MoreVertical size={20} color={colors.foreground} />*/}
      {/*</Pressable>*/}
    </View>
  )
}
