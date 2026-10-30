import { View } from "react-native"
import { EmptyState, Spinner, Text } from "@repo/ui"
import { UserAvatar } from "@/components/user-avatar"

const EMPTY_EMOJIS = ["👋", "😊", "🐼", "🦊", "🌟", "🚀", "🍀", "🌈", "🐧", "🎈", "☕", "💡"]

/** Deterministic greeting emoji, so the same chat always shows the same one. */
function emojiFor(conversationId: string): string {
  let hash = 0
  for (const character of conversationId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  return EMPTY_EMOJIS[hash % EMPTY_EMOJIS.length]!
}

/** Top-of-list content: a paging spinner, or the conversation's beginning. */
export function ConversationListHeader({
  name,
  avatar,
  hasOlder,
  loadingOlder,
}: {
  name: string
  avatar?: string
  hasOlder: boolean
  loadingOlder: boolean
}) {
  if (loadingOlder) {
    return (
      <View className="items-center py-3">
        <Spinner size="sm" />
      </View>
    )
  }
  if (hasOlder) return null

  return (
    <View className="items-center gap-2 pb-4 pt-6">
      <UserAvatar size={64} avatar={avatar} name={name} />
      <Text variant="large" className="text-center">
        {name}
      </Text>
      <Text variant="muted" className="text-center">
        This is the beginning of your conversation.
      </Text>
    </View>
  )
}

export function ConversationLoading() {
  return (
    <View className="flex-1 items-center justify-center py-16">
      <Spinner size="lg" />
    </View>
  )
}

export function ConversationEmpty({
  conversationId,
  name,
}: {
  conversationId: string
  name: string
}) {
  return (
    <EmptyState
      icon={<Text className="text-7xl">{emojiFor(conversationId)}</Text>}
      title={`Say hi to ${name}`}
      description="No messages here yet. Send a message or tap the greeting below."
      className="flex-1 self-center"
    />
  )
}
