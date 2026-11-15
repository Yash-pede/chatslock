import { useCallback, useEffect, useState } from "react"
import { Pressable, View } from "react-native"
import { router } from "expo-router"
import { ChevronLeft } from "lucide-react-native"
import { format, formatDistanceToNow } from "date-fns"
import { Button, SafeArea, Spinner, Text, useToast, useThemeColors } from "@repo/ui"
import { extractErrorMessage } from "@repo/utils"
import {
  conversationsApi,
  type ConversationSummary,
} from "@/api/conversations.api"
import { usersApi, type PublicUserProfile } from "@/api/users.api"
import { UserAvatar } from "@/components/user-avatar"

/**
 * Read-only profile behind a shared `/u/<username>` link. The username is the
 * only identifier the link carries; the endpoint resolves it and refreshes the
 * viewer's last-active timestamp so presence stays current.
 */
export function PublicProfilePage({ username }: { username: string }) {
  const colors = useThemeColors()
  const { toast } = useToast()
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [profile, setProfile] = useState<PublicUserProfile | null>(null)
  const [conversation, setConversation] = useState<ConversationSummary | null>(null)
  const [checkingConversation, setCheckingConversation] = useState(false)
  const [creating, setCreating] = useState(false)

  const fetchProfile = useCallback(() => {
    return usersApi
      .getProfile(username.toLowerCase())
      .then((next) => {
        setProfile(next)
        setStatus("ready")

        setCheckingConversation(true)
        void conversationsApi
          .getDirectConversation(next.userId)
          .then(setConversation)
          .catch(() => setConversation(null))
          .finally(() => setCheckingConversation(false))
      })
      .catch(() => setStatus("error"))
  }, [username])

  useEffect(() => {
    void fetchProfile()
  }, [fetchProfile])

  const retry = useCallback(() => {
    setStatus("loading")
    void fetchProfile()
  }, [fetchProfile])

  const openConversation = useCallback(
    (target: ConversationSummary) => {
      if (!profile) return
      // Pop back to the existing conversation if it is in the stack (profile was
      // opened from its header); otherwise replace this profile screen with it.
      // Either way only one conversation screen remains and there is no loop.
      router.dismissTo({
        pathname: "/conversation/[id]",
        params: {
          id: target.conversationId,
          name: profile.fullName,
          ...(profile.avatar ? { avatar: profile.avatar } : {}),
        },
      })
    },
    [profile],
  )

  const startConversation = useCallback(() => {
    if (!profile || creating) return

    setCreating(true)
    void conversationsApi
      .createDirectConversation(profile.userId)
      .then((next) => {
        setConversation(next)
        openConversation(next)
      })
      .catch((error) => {
        toast({
          title: "Could not start conversation",
          description: extractErrorMessage(error),
          variant: "destructive",
        })
      })
      .finally(() => setCreating(false))
  }, [creating, openConversation, profile, toast])

  return (
    <SafeArea>
      <View className="flex-1 bg-background">
        <View className="flex-row items-center px-4 py-2">
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={10}
            className="h-10 w-10 items-center justify-center rounded-full active:bg-secondary"
          >
            <ChevronLeft size={22} color={colors.foreground} />
          </Pressable>
          <Text className="ms-1 text-base font-semibold text-foreground">Profile</Text>
        </View>

        {status === "loading" ? (
          <View className="flex-1 items-center justify-center">
            <Spinner />
          </View>
        ) : status === "error" || !profile ? (
          <View className="flex-1 items-center justify-center gap-4 px-8">
            <Text variant="h4" className="text-center">
              Profile not found
            </Text>
            <Text variant="muted" className="text-center">
              This user may have changed their username or is no longer available.
            </Text>
            <View className="flex-row gap-2">
              <Button variant="outline" onPress={() => router.replace("/")}>
                Go home
              </Button>
              <Button onPress={retry}>Try again</Button>
            </View>
          </View>
        ) : (
          <View className="flex-1 items-center px-8 pt-10">
            <UserAvatar size={112} avatar={profile.avatar} name={profile.fullName} />

            <Text variant="h3" numberOfLines={2} className="mt-4 text-center">
              {profile.fullName}
            </Text>
            <Text variant="muted" className="mt-1">
              @{profile.username}
            </Text>

            <View className="mt-3 flex-row items-center gap-2">
              {profile.status === "ONLINE" ? (
                <>
                  <View className="h-2 w-2 rounded-full bg-green-500" />
                  <Text variant="small" className="text-green-600">
                    Online
                  </Text>
                </>
              ) : (
                <Text variant="small" className="text-muted-foreground">
                  Last active {formatDistanceToNow(profile.lastActiveAt, { addSuffix: true })}
                </Text>
              )}
            </View>

            <View className="mt-8 w-full max-w-sm gap-3">
              {checkingConversation ? (
                <View className="items-center">
                  <Spinner size="sm" />
                </View>
              ) : conversation ? (
                <>
                  <Text variant="muted" className="text-center">
                    {conversation.createdAt
                      ? `Conversation started ${format(conversation.createdAt, "d MMM yyyy")}`
                      : "Conversation already exists"}
                  </Text>
                  <Button onPress={() => openConversation(conversation)}>
                    Open conversation
                  </Button>
                </>
              ) : (
                <>
                  <Text variant="muted" className="text-center">
                    Start a conversation with {profile.fullName}.
                  </Text>
                  <Button onPress={startConversation} loading={creating}>
                    Start conversation
                  </Button>
                </>
              )}
            </View>
          </View>
        )}
      </View>
    </SafeArea>
  )
}
