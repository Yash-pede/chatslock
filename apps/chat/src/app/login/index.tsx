import { router } from "expo-router"
import { AlertCircle, ChevronRight, Headset, ShieldCheck, UserRound } from "lucide-react-native"
import { Pressable, View } from "react-native"
import { BrandMark, SafeArea, Text, useThemeColors } from "@repo/ui"
import { useAuth } from "@/context/AuthContext"

/**
 * Entry point for signed-out users: pick which kind of account is signing in.
 * Users continue with a phone OTP; agents sign in with username + password.
 * It is also where the user lands when a stored session was thrown away, so it
 * explains why they are here.
 */
export default function LoginChoiceScreen() {
  const colors = useThemeColors()
  const { auth } = useAuth()
  const error = auth.status === "signedOut" ? auth.error : null

  return (
    <SafeArea>
      <View className="flex-1 justify-center px-6 py-10">
        <View className="mb-12">
          <BrandMark className="mb-6" />
          <Text variant="h1" className="text-[2.15rem]">
            Chatslock
          </Text>
          <Text variant="lead" className="mt-3 leading-7">
            Private conversations between people and the team that supports them.
          </Text>
        </View>

        {error ? (
          <View className="mb-4 flex-row items-start gap-2 rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-3">
            <AlertCircle size={16} color={colors.destructive} />
            <Text variant="small" className="flex-1 font-normal text-destructive">
              {error}
            </Text>
          </View>
        ) : null}

        <View className="gap-3">
          <ChoiceRow
            icon={<UserRound size={20} color={colors.primary} />}
            title="Continue as user"
            description="Sign in with your phone and a one-time code."
            onPress={() => router.push("/login/user")}
          />
          <ChoiceRow
            icon={<Headset size={20} color={colors.primary} />}
            title="Sign in as agent"
            description="Use your agent username and password."
            onPress={() => router.push("/login/agent")}
          />
        </View>

        <View className="mt-10 flex-row items-center justify-center gap-1.5">
          <ShieldCheck size={14} color={colors.mutedForeground} />
          <Text variant="small" className="text-muted-foreground">
            Encrypted end-to-end
          </Text>
        </View>
      </View>
    </SafeArea>
  )
}

function ChoiceRow({
  icon,
  title,
  description,
  onPress,
}: {
  icon: React.ReactNode
  title: string
  description: string
  onPress: () => void
}) {
  const colors = useThemeColors()

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      className="flex-row items-center gap-4 rounded-2xl bg-secondary px-4 py-4 active:opacity-70"
    >
      <View className="h-11 w-11 items-center justify-center rounded-xl bg-background">{icon}</View>
      <View className="flex-1 gap-1">
        <Text variant="large">{title}</Text>
        <Text variant="small" className="font-normal leading-5 text-muted-foreground">
          {description}
        </Text>
      </View>
      <ChevronRight size={18} color={colors.mutedForeground} />
    </Pressable>
  )
}
